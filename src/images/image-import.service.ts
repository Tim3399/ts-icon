import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { getPublicBaseUrl } from "../../config";
import {
  normalizeChannelName,
  isSpacerChannelName,
  SPACER_BASE_IMAGE_CHANNEL_NAME,
} from "../util/util";
import {
  TeamSpeakChannelsService,
  expectedBannerUrlForId,
  isManagedByUs,
  computeChannelDepth,
  type LiveChannel,
} from "../teamspeak/teamspeak-channels";
import { ImagesService } from "./images.service";
import { MetricsService } from "../metrics/metrics.service";
import { fetchImageSafely, SsrfValidationError, FetchFailedError } from "./safe-url-fetcher";
import { processImageForStorage, InvalidImageError, ImageTooLargeError } from "./image-processing";
import { parseChannelId } from "./dto/channel-id";

export class ChannelNotFoundError extends Error {}
export class ChannelNameConflictError extends Error {}

function mapImageError(error: unknown): never {
  if (error instanceof SsrfValidationError)
    throw new BadRequestException("The given URL is not allowed");
  if (error instanceof FetchFailedError)
    throw new BadGatewayException("The image could not be downloaded");
  if (error instanceof InvalidImageError)
    throw new UnsupportedMediaTypeException("The content is not a valid image");
  if (error instanceof ImageTooLargeError)
    throw new UnprocessableEntityException("The image is too large to process");
  throw error;
}

/** Coordinates image inputs, channel identity, canonical storage and upload metrics. */
@Injectable()
export class ImageImportService {
  private readonly publicBaseUrl = getPublicBaseUrl();
  constructor(
    private readonly imagesService: ImagesService,
    private readonly metrics: MetricsService,
    private readonly channels: TeamSpeakChannelsService,
  ) {}
  async findLegacyChannel(name: string): Promise<LiveChannel> {
    const matches = (await this.channels.fetchLiveChannels()).filter(
      (c) => normalizeChannelName(c.name) === name,
    );
    if (!matches.length) throw new ChannelNotFoundError("No live channel matches this name");
    if (matches.length > 1)
      throw new ChannelNameConflictError("Ambiguous channel name; select a channel ID");
    return matches[0];
  }

  async resolveUploadChannel(
    normalizedChannelName: string,
  ): Promise<{ channelId: string; channelName: string }> {
    const match = await this.findLegacyChannel(normalizedChannelName);
    const existing = await this.imagesService.findByChannelId(match.cid);
    if (!existing && (await this.imagesService.channelNameInUse(normalizedChannelName))) {
      throw new ChannelNameConflictError(
        "An unassigned legacy image occupies this name; use the channel-ID upload or review the backfill",
      );
    }
    return { channelId: match.cid, channelName: normalizedChannelName };
  }

  async liveById(value: string): Promise<LiveChannel> {
    const cid = parseChannelId(value);
    let channels: LiveChannel[];
    try {
      channels = await this.channels.fetchLiveChannels();
    } catch {
      throw new ServiceUnavailableException("TeamSpeak is currently unreachable");
    }
    const channel = channels.find((c) => c.cid === cid);
    if (!channel) throw new NotFoundException("Channel not found");
    await this.imagesService.syncChannels(channels, true);
    return channel;
  }

  async legacyChannel(value: string, method = "upload") {
    const name = normalizeChannelName(value);
    if (!name) throw new BadRequestException("Invalid channel name");
    try {
      return await this.resolveUploadChannel(name);
    } catch (error) {
      this.metrics.imageUploadsTotal.inc({ method, result: "failure" });
      if (error instanceof ChannelNameConflictError) throw new ConflictException(error.message);
      if (error instanceof ChannelNotFoundError) throw new BadRequestException(error.message);
      this.metrics.teamspeakErrorsTotal.inc({ operation: "resolve-channel" });
      throw new ServiceUnavailableException("TeamSpeak is currently unreachable");
    }
  }

  async store(
    channel: { cid: string; name: string },
    buffer: Buffer,
    subject: string | undefined,
    method = "upload",
  ) {
    try {
      const image = await processImageForStorage(buffer);
      await this.imagesService.saveImage(
        channel.name,
        image.buffer,
        image.mimeType,
        channel.cid,
        subject,
      );
      this.metrics.imageUploadsTotal.inc({ method, result: "success" });
      return {
        message: "Image saved successfully",
        contentHash: (await this.imagesService.getImageByChannelId(channel.cid))?.contentHash,
        imageUrl: expectedBannerUrlForId(channel.cid, this.publicBaseUrl),
      };
    } catch (error) {
      this.metrics.imageUploadsTotal.inc({ method, result: "failure" });
      mapImageError(error);
    }
  }

  async channelItems() {
    let channels: LiveChannel[];
    try {
      channels = await this.channels.fetchLiveChannels();
    } catch {
      throw new ServiceUnavailableException("TeamSpeak is currently unreachable");
    }
    await this.imagesService.syncChannels(channels, true);
    const metadata = await this.imagesService.listMetadata();
    const base = metadata.find((r) => r.channelName === SPACER_BASE_IMAGE_CHANNEL_NAME);
    const byId = new Map(metadata.filter((r) => r.channelId).map((r) => [r.channelId, r]));
    const channelsById = new Map(channels.map((channel) => [channel.cid, channel]));
    const liveNameCounts = new Map<string, number>();
    for (const channel of channels) {
      const name = normalizeChannelName(channel.name);
      liveNameCounts.set(name, (liveNameCounts.get(name) ?? 0) + 1);
    }
    const legacyByName = new Map<string, typeof metadata>();
    for (const image of metadata) {
      if (image.channelId || image.channelName === SPACER_BASE_IMAGE_CHANNEL_NAME) continue;
      const name = normalizeChannelName(image.channelName);
      const matches = legacyByName.get(name) ?? [];
      matches.push(image);
      legacyByName.set(name, matches);
    }
    return channels.map((channel) => {
      const name = normalizeChannelName(channel.name);
      const legacy = legacyByName.get(name) ?? [];
      const own =
        byId.get(channel.cid) ??
        (liveNameCounts.get(name) === 1 && legacy.length === 1 ? legacy[0] : undefined);
      const isSpacer = isSpacerChannelName(channel.name);
      const fallback = isSpacer ? base : undefined;
      return {
        ...channel,
        isSpacer,
        hasImage: !!own,
        hasFallback: !own && !!fallback,
        contentHash: (own ?? fallback)?.contentHash,
        imageUrl: expectedBannerUrlForId(channel.cid, this.publicBaseUrl),
        depth: computeChannelDepth(channel.cid, channelsById),
        managed: isManagedByUs(channel, this.publicBaseUrl),
      };
    });
  }

  async importFromUrl(channelName: string, url: string, subject?: string) {
    const channel = await this.legacyChannel(channelName, "from-url");
    try {
      const { buffer } = await fetchImageSafely(url);
      return await this.store(
        { cid: channel.channelId, name: channel.channelName },
        buffer,
        subject,
        "from-url",
      );
    } catch (error) {
      if (error instanceof SsrfValidationError)
        this.metrics.ssrfBlockedTotal.inc({ route: "from-url" });
      mapImageError(error);
    }
  }

  async storeSpacerBase(buffer: Buffer, subject?: string) {
    try {
      const image = await processImageForStorage(buffer);
      await this.imagesService.saveImage(
        SPACER_BASE_IMAGE_CHANNEL_NAME,
        image.buffer,
        image.mimeType,
        undefined,
        subject,
      );
      return { message: "Spacer base image set successfully" };
    } catch (error) {
      mapImageError(error);
    }
  }

  async fetchProxyImage(url: string) {
    try {
      return await fetchImageSafely(url);
    } catch (error) {
      if (error instanceof SsrfValidationError)
        this.metrics.ssrfBlockedTotal.inc({ route: "img-from-url" });
      mapImageError(error);
    }
  }
}
