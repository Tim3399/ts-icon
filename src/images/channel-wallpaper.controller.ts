import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiExtraModels, ApiTags, getSchemaPath } from "@nestjs/swagger";
import type { Express, Request } from "express";
import { isUUID } from "class-validator";
import { createHash } from "node:crypto";
import { OIDC_ADMIN_ROLE } from "../../config";
import { Roles } from "../auth/roles.decorator";
import { MetricsService } from "../metrics/metrics.service";
import { AuditAction, AuditLoggingInterceptor } from "./audit-logging.interceptor";
import { imageFileFilter } from "./dto/image-file-filter";
import { fetchImageSafely, FetchFailedError, SsrfValidationError } from "./safe-url-fetcher";
import { InvalidImageError, ImageTooLargeError, OUTPUT_MIME_TYPE } from "./image-processing";
import { ImageProcessingBusyError } from "./image-processing-gate";
import {
  buildAlternatingRowPlan,
  sliceWallpaper,
  MAX_WALLPAPER_ROWS,
  type WallpaperRow,
  type WallpaperBackgroundColor,
} from "./wallpaper-slicer";
import {
  computeChannelDepth,
  TeamSpeakChannelsService,
  type LiveChannel,
} from "../teamspeak/teamspeak-channels";
import { ChannelWallpaperService } from "./channel-wallpaper.service";
import { GenerateChannelWallpaperDto } from "./dto/generate-channel-wallpaper.dto";
import { UndoChannelWallpaperDto } from "./dto/undo-channel-wallpaper.dto";

const UPLOAD_LIMIT = 20 * 1024 * 1024;

export function parseBackgroundColor(hex?: string): WallpaperBackgroundColor | undefined {
  if (!hex) return undefined;
  const match = /^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(hex);
  if (!match) throw new BadRequestException("backgroundColor must be #RRGGBB or #RRGGBBAA");
  return {
    r: parseInt(match[1].slice(0, 2), 16),
    g: parseInt(match[1].slice(2, 4), 16),
    b: parseInt(match[1].slice(4, 6), 16),
    alpha: match[2] ? parseInt(match[2], 16) : 255,
  };
}

export function namesForRows(namePrefix: string, rows: WallpaperRow[]): string[] {
  let art = 0;
  let spacer = 0;
  return rows.map((row) =>
    row.isSpacer ? namePrefix + " spacer " + ++spacer : namePrefix + " " + ++art,
  );
}

export async function resolveSourceImage(
  file: Express.Multer.File | undefined,
  url: string | undefined,
  onBlocked?: () => void,
): Promise<Buffer> {
  if (file && url) throw new BadRequestException("Provide a file or sourceImageUrl, not both");
  if (file?.buffer) return file.buffer;
  if (!url) throw new BadRequestException("Provide a file or sourceImageUrl");
  try {
    return (await fetchImageSafely(url, { maxBytes: UPLOAD_LIMIT })).buffer;
  } catch (error) {
    if (error instanceof SsrfValidationError) {
      onBlocked?.();
      throw new BadRequestException("The given URL is not allowed");
    }
    if (error instanceof FetchFailedError)
      throw new UnprocessableEntityException("The source image could not be downloaded");
    throw error;
  }
}

export function prepareRows(
  channels: LiveChannel[],
  parentCid: string | undefined,
  mode: "flat" | "nested-spacer",
) {
  const normalizedParent = parentCid?.trim() || null;
  if (normalizedParent !== null && !channels.some((channel) => channel.cid === normalizedParent)) {
    return Promise.reject(new BadRequestException("The selected parent channel no longer exists"));
  }
  return Promise.resolve({
    parentDepth: computeChannelDepth(normalizedParent, channels),
    relativeRows: buildAlternatingRowPlan(MAX_WALLPAPER_ROWS, mode),
  });
}

function mapProcessingError(error: unknown): never {
  if (error instanceof InvalidImageError) throw new UnsupportedMediaTypeException(error.message);
  if (error instanceof ImageTooLargeError) throw new UnprocessableEntityException(error.message);
  if (error instanceof ImageProcessingBusyError)
    throw new ServiceUnavailableException(error.message);
  throw error;
}

export function wallpaperRequestHash(buffer: Buffer, dto: GenerateChannelWallpaperDto): string {
  return createHash("sha256")
    .update(buffer)
    .update(
      JSON.stringify({
        parentCid: dto.parentCid?.trim() || null,
        namePrefix: dto.namePrefix.trim(),
        spacerMode: dto.spacerMode,
        xOffset: dto.xOffset ?? 0,
        yOffset: dto.yOffset ?? 0,
        backgroundColor: parseBackgroundColor(dto.backgroundColor) ?? null,
        coverFitMode: dto.coverFitMode !== "false",
      }),
    )
    .digest("hex");
}

@ApiTags("images-local")
@ApiExtraModels(GenerateChannelWallpaperDto)
@Controller("images-local/channel-wallpaper")
export class ChannelWallpaperController {
  constructor(
    private readonly runs: ChannelWallpaperService,
    private readonly metrics: MetricsService,
    private readonly channels: TeamSpeakChannelsService,
  ) {}

  private async slices(buffer: Buffer, dto: GenerateChannelWallpaperDto) {
    let channels: LiveChannel[];
    try {
      channels = await this.channels.fetchLiveChannels();
    } catch {
      throw new ServiceUnavailableException("TeamSpeak is currently unreachable");
    }
    const { relativeRows, parentDepth } = await prepareRows(
      channels,
      dto.parentCid,
      dto.spacerMode,
    );
    const absoluteRows = relativeRows.map((row) => ({
      ...row,
      depth: parentDepth + 1 + row.depth,
    }));
    try {
      const slices = await sliceWallpaper(buffer, absoluteRows, {
        xOffset: dto.xOffset,
        yOffset: dto.yOffset,
        backgroundColor: parseBackgroundColor(dto.backgroundColor),
        coverFitMode: dto.coverFitMode !== "false",
      });
      if (!slices.length)
        throw new UnprocessableEntityException("The image is too short for one banner row");
      return { slices, rows: relativeRows.slice(0, slices.length) };
    } catch (error) {
      mapProcessingError(error);
    }
  }

  @Post()
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      allOf: [
        { $ref: getSchemaPath(GenerateChannelWallpaperDto) },
        {
          type: "object",
          required: ["requestId"],
          properties: { file: { type: "string", format: "binary" } },
        },
      ],
    },
  })
  @Roles(OIDC_ADMIN_ROLE)
  @AuditAction("generate-channel-wallpaper")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: UPLOAD_LIMIT }, fileFilter: imageFileFilter }),
    AuditLoggingInterceptor,
  )
  async generate(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: GenerateChannelWallpaperDto,
    @Req() req: Request,
  ) {
    if (!dto.requestId || !isUUID(dto.requestId))
      throw new BadRequestException("A UUID requestId is required");
    try {
      const source = await resolveSourceImage(file, dto.sourceImageUrl, () =>
        this.metrics.ssrfBlockedTotal.inc({ route: "channel-wallpaper" }),
      );
      const requestHash = wallpaperRequestHash(source, dto);
      const existing = await this.runs.existing(dto.requestId, requestHash);
      if (existing) return existing;
      const { slices, rows } = await this.slices(source, dto);
      const names = namesForRows(dto.namePrefix.trim(), rows);
      const prepared = await this.runs.prepare(
        dto.requestId,
        requestHash,
        dto.parentCid?.trim() || null,
        rows.map((row, i) => ({ ...row, name: names[i], image: slices[i].image })),
        req.user?.sub,
      );
      const result = await this.runs.resume(prepared.runId);
      this.metrics.channelWallpaperGenerationsTotal.inc({
        result: result.status === "completed" ? "success" : "partial-failure",
      });
      return result;
    } catch (error) {
      this.metrics.channelWallpaperGenerationsTotal.inc({ result: "failure" });
      throw error;
    }
  }

  @Post("preview")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      allOf: [
        { $ref: getSchemaPath(GenerateChannelWallpaperDto) },
        { type: "object", properties: { file: { type: "string", format: "binary" } } },
      ],
    },
  })
  @Roles(OIDC_ADMIN_ROLE)
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: UPLOAD_LIMIT }, fileFilter: imageFileFilter }),
  )
  async preview(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: GenerateChannelWallpaperDto,
  ) {
    const source = await resolveSourceImage(file, dto.sourceImageUrl, () =>
      this.metrics.ssrfBlockedTotal.inc({ route: "channel-wallpaper-preview" }),
    );
    const { slices, rows } = await this.slices(source, dto);
    return {
      rows: slices.map((slice, i) => ({
        ...rows[i],
        imageDataUrl: "data:" + OUTPUT_MIME_TYPE + ";base64," + slice.image.toString("base64"),
      })),
    };
  }

  @Get("runs")
  @Roles(OIDC_ADMIN_ROLE)
  listRuns() {
    return this.runs.list();
  }

  @Get("runs/:runId")
  @Roles(OIDC_ADMIN_ROLE)
  getRun(@Param("runId", new ParseUUIDPipe()) runId: string) {
    return this.runs.get(runId);
  }

  @Post("runs/:runId/resume")
  @Roles(OIDC_ADMIN_ROLE)
  @AuditAction("resume-channel-wallpaper")
  @UseInterceptors(AuditLoggingInterceptor)
  resume(@Param("runId", new ParseUUIDPipe()) runId: string) {
    return this.runs.resume(runId);
  }

  @Post("undo")
  @Roles(OIDC_ADMIN_ROLE)
  @AuditAction("undo-channel-wallpaper")
  @UseInterceptors(AuditLoggingInterceptor)
  undo(@Body() dto: UndoChannelWallpaperDto) {
    return this.runs.undo(dto.runId);
  }
}
