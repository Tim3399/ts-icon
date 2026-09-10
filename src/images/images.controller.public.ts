import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Req,
  Res,
  NotFoundException,
} from "@nestjs/common";
import { ImagesService, type StoredImage } from "./images.service";
import type { Request, Response } from "express";
import { ApiTags, ApiOperation, ApiParam } from "@nestjs/swagger";
import { parseChannelId } from "./dto/channel-id";
export { parseChannelId } from "./dto/channel-id";
import {
  normalizeChannelName,
  isSpacerChannelName,
  SPACER_BASE_IMAGE_CHANNEL_NAME,
} from "../util/util";

export function ifNoneMatchSatisfied(value: string | undefined, etag: string): boolean {
  if (!value) return false;
  return (
    value.trim() === "*" ||
    value.split(",").some((tag) => tag.trim().replace(/^W\//, "") === etag.replace(/^W\//, ""))
  );
}

@ApiTags("images")
@Controller("images")
export class ImagesPublicController {
  constructor(private readonly imagesService: ImagesService) {}

  private send(image: StoredImage | null, req: Request, res: Response) {
    if (!image) throw new NotFoundException("Image not found");
    const etag = '"' + image.contentHash + '"';
    res.setHeader("Cache-Control", "public, no-cache");
    res.setHeader("ETag", etag);
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (ifNoneMatchSatisfied(req.get("If-None-Match"), etag)) return res.status(304).end();
    res.setHeader("Content-Type", image.mimeType);
    return res.send(image.image);
  }

  @Get("by-id/:cid")
  @ApiOperation({ summary: "Stable image URL for a TeamSpeak channel ID" })
  async getImageById(@Param("cid") cid: string, @Req() req: Request, @Res() res: Response) {
    return this.send(
      await this.imagesService.getPublicImageByChannelId(parseChannelId(cid)),
      req,
      res,
    );
  }

  @Get("wallpaper/:runId/:position")
  async getWallpaperImage(
    @Param("runId") runId: string,
    @Param("position") position: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!/^[0-9a-f-]{36}$/i.test(runId) || !/^[0-9]{1,3}\.png$/.test(position)) {
      throw new BadRequestException("Invalid wallpaper image address");
    }
    return this.send(
      await this.imagesService.getWallpaperImage(runId, Number(position.slice(0, -4))),
      req,
      res,
    );
  }

  @Get(":channelName")
  @ApiOperation({ summary: "Legacy name-based image URL; ambiguous names return 409" })
  @ApiParam({ name: "channelName", type: String })
  async getImage(
    @Param("channelName") channelName: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const name = channelName.replace(/\.png$/i, "");
    if (!name.trim() || name.length > 200) throw new BadRequestException("Invalid channel name");
    const normalized = normalizeChannelName(name);
    if (!normalized) throw new BadRequestException("Channel name has no usable characters");
    let image = await this.imagesService.getImage(normalized);
    if (!image && isSpacerChannelName(normalized)) {
      image = await this.imagesService.getImage(SPACER_BASE_IMAGE_CHANNEL_NAME);
    }
    return this.send(image, req, res);
  }
}
