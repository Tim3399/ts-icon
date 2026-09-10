import {
  ImageImportService,
  ChannelNotFoundError,
  ChannelNameConflictError,
} from "./image-import.service";
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import type { Express, Request, Response } from "express";
import { OIDC_ADMIN_ROLE, OIDC_EDITOR_ROLE, getPublicBaseUrl } from "../../config";
import { Roles } from "../auth/roles.decorator";
import { normalizeChannelName, SPACER_BASE_IMAGE_CHANNEL_NAME } from "../util/util";
import {
  TeamSpeakChannelsService,
  expectedBannerUrlForId,
  type LiveChannel,
} from "../teamspeak/teamspeak-channels";
import { ImagesService } from "./images.service";
import { ImageFromUrlDto } from "./dto/image-from-url.dto";
import { ImgFromUrlQueryDto } from "./dto/img-from-url-query.dto";
import { ChannelNameValidationPipe } from "./dto/channel-name-validation.pipe";
import { AuditAction, AuditLoggingInterceptor } from "./audit-logging.interceptor";
import { parseChannelId } from "./dto/channel-id";
import { imageFileFilter } from "./dto/image-file-filter";
export { imageFileFilter } from "./dto/image-file-filter";

const UPLOAD_LIMIT = 5 * 1024 * 1024;
const UPLOAD_SCHEMA = {
  type: "object",
  required: ["file"],
  properties: { file: { type: "string", format: "binary" } },
};

@ApiTags("images-local")
@Controller("images-local")
export class ImagesLocalController {
  private readonly publicBaseUrl = getPublicBaseUrl();
  constructor(
    private readonly imagesService: ImagesService,
    private readonly imports: ImageImportService,
    private readonly channels: TeamSpeakChannelsService,
  ) {}

  @Post("from-url")
  @Roles(OIDC_EDITOR_ROLE)
  @AuditAction("from-url")
  @UseInterceptors(AuditLoggingInterceptor)
  async uploadImageFromUrl(@Body() body: ImageFromUrlDto, @Req() req: Request) {
    return this.imports.importFromUrl(body.channelName, body.url, req.user?.sub);
  }

  @Get("spacer-base-image")
  @Roles(OIDC_EDITOR_ROLE)
  async getSpacerBaseImage(@Res() res: Response) {
    const image = await this.imagesService.getImage(SPACER_BASE_IMAGE_CHANNEL_NAME);
    if (!image) throw new NotFoundException("No spacer base image has been set yet");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Type", image.mimeType);
    return res.send(image.image);
  }

  @Post("spacer-base-image")
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: UPLOAD_SCHEMA })
  @Roles(OIDC_EDITOR_ROLE)
  @AuditAction("set-spacer-base-image")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: UPLOAD_LIMIT }, fileFilter: imageFileFilter }),
    AuditLoggingInterceptor,
  )
  async uploadSpacerBaseImage(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file?.buffer) throw new BadRequestException("No file uploaded");
    return this.imports.storeSpacerBase(file.buffer, req.user?.sub);
  }

  @Post("channels/:cid/image")
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: UPLOAD_SCHEMA })
  @Roles(OIDC_EDITOR_ROLE)
  @AuditAction("upload")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: UPLOAD_LIMIT }, fileFilter: imageFileFilter }),
    AuditLoggingInterceptor,
  )
  async uploadImageById(
    @Param("cid") cid: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file?.buffer) throw new BadRequestException("No file uploaded");
    return this.imports.store(await this.imports.liveById(cid), file.buffer, req.user?.sub);
  }

  @Delete("channels/:cid/image")
  @Roles(OIDC_EDITOR_ROLE)
  @AuditAction("delete")
  @UseInterceptors(AuditLoggingInterceptor)
  async deleteImageById(@Param("cid") cid: string) {
    if (!(await this.imagesService.deleteImageByChannelId(parseChannelId(cid))))
      throw new NotFoundException("Image not found");
    return { message: "Image deleted successfully" };
  }

  @Patch("channels/:cid/banner-url")
  @Roles(OIDC_ADMIN_ROLE)
  @AuditAction("set-banner-url")
  @UseInterceptors(AuditLoggingInterceptor)
  async setBannerUrlById(@Param("cid") cid: string) {
    const channel = await this.imports.liveById(cid);
    await this.imagesService.syncChannels([channel]);
    const url = expectedBannerUrlForId(channel.cid, this.publicBaseUrl);
    try {
      await this.channels.setChannelBannerUrl(channel.cid, url);
    } catch {
      throw new ServiceUnavailableException("The channel banner could not be updated");
    }
    return { message: "Banner URL set successfully", bannerGfxUrl: url };
  }

  @Post(":channelName")
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: UPLOAD_SCHEMA })
  @Roles(OIDC_EDITOR_ROLE)
  @AuditAction("upload")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: UPLOAD_LIMIT }, fileFilter: imageFileFilter }),
    AuditLoggingInterceptor,
  )
  async uploadImage(
    @Param("channelName", ChannelNameValidationPipe) channelName: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file?.buffer) throw new BadRequestException("No file uploaded");
    const channel = await this.imports.legacyChannel(channelName);
    return this.imports.store(
      { cid: channel.channelId, name: channel.channelName },
      file.buffer,
      req.user?.sub,
    );
  }

  @Delete(":channelName")
  @Roles(OIDC_EDITOR_ROLE)
  @AuditAction("delete")
  @UseInterceptors(AuditLoggingInterceptor)
  async deleteImage(@Param("channelName", ChannelNameValidationPipe) channelName: string) {
    const normalized = normalizeChannelName(channelName);
    if (!normalized) throw new BadRequestException("Invalid channel name");
    if (!(await this.imagesService.deleteImage(normalized)))
      throw new NotFoundException("Image not found");
    return { message: "Image deleted successfully" };
  }

  @Get("options")
  @Roles(OIDC_ADMIN_ROLE)
  async listOptions() {
    return { options: await this.imagesService.listOptions() };
  }

  @Get("img-from-url")
  @Roles(OIDC_EDITOR_ROLE)
  async proxyImage(@Query() query: ImgFromUrlQueryDto, @Res() res: Response) {
    const { buffer, contentType } = await this.imports.fetchProxyImage(query.url);
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(buffer);
  }

  @Get("channels")
  @Roles(OIDC_EDITOR_ROLE)
  async listChannels() {
    const items = await this.imports.channelItems();
    return { channels: items.map((c) => normalizeChannelName(c.name)), items };
  }

  @Get("channels/banner-urls")
  @Roles(OIDC_ADMIN_ROLE)
  async listChannelBannerUrls() {
    return { channels: await this.imports.channelItems() };
  }

  @Patch(":channelName/banner-url")
  @Roles(OIDC_ADMIN_ROLE)
  @AuditAction("set-banner-url")
  @UseInterceptors(AuditLoggingInterceptor)
  async setBannerUrl(@Param("channelName", ChannelNameValidationPipe) channelName: string) {
    const name = normalizeChannelName(channelName);
    if (!name) throw new BadRequestException("Invalid channel name");
    let channel: LiveChannel;
    try {
      channel = await this.imports.findLegacyChannel(name);
    } catch (error) {
      if (error instanceof ChannelNameConflictError) throw new ConflictException(error.message);
      if (error instanceof ChannelNotFoundError) throw new BadRequestException(error.message);
      throw new ServiceUnavailableException("TeamSpeak is currently unreachable");
    }
    return this.setBannerUrlById(channel.cid);
  }

  @Post("channels/apply-banner-urls")
  @Roles(OIDC_ADMIN_ROLE)
  @AuditAction("apply-banner-urls")
  @UseInterceptors(AuditLoggingInterceptor)
  async applyBannerUrls() {
    try {
      await this.imagesService.syncChannels(await this.channels.fetchLiveChannels(), true);
      return await this.channels.applyBannerUrlsForAllChannels(this.publicBaseUrl);
    } catch {
      throw new ServiceUnavailableException("TeamSpeak is currently unreachable");
    }
  }
}
