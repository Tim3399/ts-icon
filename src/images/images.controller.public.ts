import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ImagesService } from './images.service';
import { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';

import {
  normalizeChannelName,
  isSpacerChannelName,
  SPACER_BASE_IMAGE_CHANNEL_NAME,
} from '../util/util';
import { ChannelNameValidationPipe } from './dto/channel-name-validation.pipe';

const logger = new Logger('ImagesPublicController');

/**
 * Checks a raw `If-None-Match` request header value against the current
 * ETag. Supports the two shapes the HTTP spec actually allows for this
 * header: a bare `*` (matches any current representation) and a
 * comma-separated list of quoted entity tags — a client re-requesting a
 * single resource almost always sends back exactly the one ETag it was
 * given, but the list form is valid too and cheap to support correctly.
 */
export function ifNoneMatchSatisfied(
  ifNoneMatch: string | undefined,
  etag: string,
): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === '*') return true;
  return ifNoneMatch
    .split(',')
    .map((value) => value.trim())
    .includes(etag);
}

@ApiTags('images')
@Controller('images')
export class ImagesPublicController {
  constructor(private readonly imagesService: ImagesService) {}

  @Get(':channelName')
  @ApiOperation({ summary: 'Fetch channel image from the database' })
  @ApiParam({ name: 'channelName', type: String })
  async getImage(
    @Param('channelName', ChannelNameValidationPipe) channelName: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const normalizedChannel = normalizeChannelName(channelName);
    logger.log(`[getImage] Request: channelName=${normalizedChannel}`);
    let image = await this.imagesService.getImage(normalizedChannel);

    // A spacer channel with no image of its own falls back to the shared
    // base image (if one has been set) rather than 404ing -- "a spacer is
    // then always the base image, unless it has its own [image] set"
    // (human operator's own framing). Deliberately a live, per-request
    // fallback rather than a one-time bulk-copy into every spacer's own
    // row: it applies to newly-created spacer channels automatically, with
    // no separate "re-sync" step ever needed, and a channel keeps its own
    // override for as long as it has one (checked first, above).
    if (!image && isSpacerChannelName(normalizedChannel)) {
      logger.log(
        `[getImage] No image for spacer channel ${normalizedChannel}, falling back to the base image`,
      );
      image = await this.imagesService.getImage(SPACER_BASE_IMAGE_CHANNEL_NAME);
    }

    if (!image) {
      logger.warn(`[getImage] Image not found for ${normalizedChannel}`);
      throw new NotFoundException('Image not found');
    }

    const etag = `"${image.contentHash}"`;
    // Set for both the 304 and 200 outcomes below -- a 304 response must
    // still carry the validator it's confirming, plus the same cache policy
    // as the 200 it stands in for.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('ETag', etag);

    if (ifNoneMatchSatisfied(req.get('If-None-Match'), etag)) {
      logger.log(
        `[getImage] Not modified (If-None-Match matched) for ${normalizedChannel}`,
      );
      return res.status(304).end();
    }

    res.setHeader('Content-Type', image.mimeType);
    logger.log(`[getImage] Image served successfully for ${normalizedChannel}`);
    return res.send(image.image);
  }
}
