import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  Post,
  Patch,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  BadGatewayException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
  UnprocessableEntityException,
  Body,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImagesService } from './images.service';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { Express, Request, Response } from 'express';

import {
  OIDC_ADMIN_ROLE,
  OIDC_EDITOR_ROLE,
  getPublicBaseUrl,
} from '../../config';
import {
  normalizeChannelName,
  SPACER_BASE_IMAGE_CHANNEL_NAME,
} from '../util/util';
import {
  fetchLiveChannels,
  expectedBannerUrl,
  isManagedByUs,
  setChannelBannerUrl,
  applyBannerUrlsForAllChannels,
  type LiveChannel,
} from '../teamspeak/teamspeak-channels';
import {
  fetchImageSafely,
  SsrfValidationError,
  FetchFailedError,
} from './safe-url-fetcher';
import {
  processImageForStorage,
  InvalidImageError,
  ImageTooLargeError,
} from './image-processing';
import { Roles } from '../auth/roles.decorator';
import { ImageFromUrlDto } from './dto/image-from-url.dto';
import { ImgFromUrlQueryDto } from './dto/img-from-url-query.dto';
import { ChannelNameValidationPipe } from './dto/channel-name-validation.pipe';
import {
  AuditAction,
  AuditLoggingInterceptor,
} from './audit-logging.interceptor';
import { MetricsService } from '../metrics/metrics.service';

const logger = new Logger('ImagesLocalController');

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Rejects with a proper Nest `HttpException` rather than a bare `Error` —
 * `@nestjs/platform-express`'s `FileInterceptor` passes any error it
 * receives through `transformException()`, which leaves an already-`
 * HttpException` untouched but otherwise falls back to a generic 500. A
 * plain `Error` here (the previous behavior) therefore surfaced as an
 * unhandled 500 for both "no file"/"unrecognized mimetype" cases; using
 * `BadRequestException`/`UnsupportedMediaTypeException` directly makes those
 * cases 400/415 as they should be. (Exceeding `MAX_FILE_SIZE` is handled
 * separately by Multer's own `LIMIT_FILE_SIZE` error, which
 * `transformException()` already maps to a 413 `PayloadTooLargeException`
 * without any help from this filter.)
 *
 * This only checks the client-supplied MIME type string, which a caller can
 * set to anything regardless of the file's actual bytes -- it's a cheap,
 * fast-fail pre-check, not a security boundary. The real check is
 * `processImageForStorage()` fully decoding the uploaded bytes and trusting
 * only what it actually detects.
 */
export function imageFileFilter(
  req: unknown,
  file: Express.Multer.File,
  cb: (err: Error | null, acceptFile: boolean) => void,
) {
  if (!file || !file.mimetype)
    return cb(new BadRequestException('Invalid file'), false);
  if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) return cb(null, true);
  return cb(
    new UnsupportedMediaTypeException(
      `Unsupported file type: ${file.mimetype}`,
    ),
    false,
  );
}

async function listChannelNames(): Promise<string[]> {
  const channels = await fetchLiveChannels();
  const channelNames = channels.map((c) => normalizeChannelName(c.name));
  logger.log(`[listChannelNames] Found channels: ${channelNames.join(', ')}`);
  return channelNames;
}

/** Thrown when no live TeamSpeak channel matches the admin-provided name. */
export class ChannelNotFoundError extends Error {}

/**
 * Thrown when the resolved live channel is genuinely new (no row has its
 * channelId yet), but a *different* row already occupies the normalized
 * channelName it resolves to — the actual collision this whole migration
 * exists to catch, rather than silently overwriting that other channel's
 * image.
 */
export class ChannelNameConflictError extends Error {}

/**
 * Resolves an admin-provided (already normalized) channel name against the
 * live TeamSpeak channel list and decides how the upload should be applied:
 *
 * - No live channel matches at all -> `ChannelNotFoundError`.
 * - The matched live channel's ID already has a row -> that's an update
 *   (the channel may have been renamed since the row was created; that's
 *   fine, it's still the same channel), return its ID.
 * - The matched live channel's ID has no row yet, but a different row
 *   already has this exact channelName -> `ChannelNameConflictError`.
 * - Otherwise -> a genuinely new channel, return its ID for a new row.
 */
export async function resolveUploadChannel(
  imagesService: ImagesService,
  normalizedChannelName: string,
): Promise<{ channelId: string; channelName: string }> {
  const liveChannels = await fetchLiveChannels();
  const match = liveChannels.find(
    (c) => normalizeChannelName(c.name) === normalizedChannelName,
  );
  if (!match) {
    throw new ChannelNotFoundError(
      `No live TeamSpeak channel matches "${normalizedChannelName}"`,
    );
  }

  const existingById = await imagesService.findByChannelId(match.cid);
  if (existingById) {
    return { channelId: match.cid, channelName: normalizedChannelName };
  }

  const nameTaken = await imagesService.channelNameInUse(normalizedChannelName);
  if (nameTaken) {
    throw new ChannelNameConflictError(
      `The channel name "${normalizedChannelName}" is already associated with a different channel`,
    );
  }

  return { channelId: match.cid, channelName: normalizedChannelName };
}

/**
 * Resolves an admin-provided (already normalized) channel name to its live
 * TeamSpeak channel, for the banner-url endpoints below. Simpler than
 * `resolveUploadChannel()` above -- this never touches the images database
 * at all, so none of that function's channelId-row/collision logic applies,
 * just the live-channel lookup itself (reusing the same `ChannelNotFoundError`
 * for a consistent not-found message/handling across both).
 */
async function findLiveChannelByName(
  normalizedChannelName: string,
): Promise<LiveChannel> {
  const liveChannels = await fetchLiveChannels();
  const match = liveChannels.find(
    (c) => normalizeChannelName(c.name) === normalizedChannelName,
  );
  if (!match) {
    throw new ChannelNotFoundError(
      `No live TeamSpeak channel matches "${normalizedChannelName}"`,
    );
  }
  return match;
}

@ApiTags('images-local')
@Controller('images-local')
export class ImagesLocalController {
  // Computed once at controller construction (i.e. app bootstrap, since
  // Nest controllers are singleton-scoped by default) rather than re-read
  // per request -- fails fast at startup exactly like the OIDC config does,
  // instead of only surfacing the missing-env-var error on whichever
  // request happens to hit a banner-url endpoint first.
  private readonly publicBaseUrl = getPublicBaseUrl();

  constructor(
    private readonly imagesService: ImagesService,
    private readonly metrics: MetricsService,
  ) {}

  @Post('from-url')
  @Roles(OIDC_EDITOR_ROLE)
  @AuditAction('from-url')
  @UseInterceptors(AuditLoggingInterceptor)
  @ApiOperation({
    summary: 'Upload an image from a URL for the channel (local only)',
  })
  @ApiBody({ type: ImageFromUrlDto })
  async uploadImageFromUrl(@Body() body: ImageFromUrlDto, @Req() req: Request) {
    const { channelName, url } = body;
    const normalizedChannel = normalizeChannelName(channelName);
    logger.log(
      `[from-url] Request: channelName=${normalizedChannel}, url=${url}`,
    );
    if (!normalizedChannel) {
      // The DTO already rejects an empty/missing channelName; this guards
      // against a non-empty name that normalizes away to nothing (e.g. a
      // string of only characters normalizeChannelName strips).
      logger.warn(`[from-url] channelName normalized to an empty string`);
      this.metrics.imageUploadsTotal.inc({
        method: 'from-url',
        result: 'failure',
      });
      throw new BadRequestException('channelName is invalid');
    }

    let resolved: { channelId: string; channelName: string };
    try {
      resolved = await resolveUploadChannel(
        this.imagesService,
        normalizedChannel,
      );
    } catch (err) {
      this.metrics.imageUploadsTotal.inc({
        method: 'from-url',
        result: 'failure',
      });
      if (err instanceof ChannelNotFoundError) {
        logger.warn(`[from-url] ${err.message}`);
        throw new BadRequestException(err.message);
      }
      if (err instanceof ChannelNameConflictError) {
        logger.warn(`[from-url] ${err.message}`);
        throw new ConflictException(err.message);
      }
      logger.error(`[from-url] TeamSpeak channel resolution failed:`, err);
      this.metrics.teamspeakErrorsTotal.inc({ operation: 'resolve-channel' });
      throw new ServiceUnavailableException(
        'TeamSpeak is currently unreachable',
      );
    }

    try {
      const { buffer } = await fetchImageSafely(url);
      // The fetched `Content-Type` header is never trusted for what the
      // bytes actually are -- this endpoint has no client-side cropping
      // step at all, so `processImageForStorage()` is what validates the
      // decoded format, enforces dimensions, and center-crops/resizes to
      // the fixed banner size before anything is persisted.
      const processed = await processImageForStorage(buffer);
      await this.imagesService.saveImage(
        resolved.channelName,
        processed.buffer,
        processed.mimeType,
        resolved.channelId,
        req.user?.sub,
      );
      logger.log(
        `[from-url] Image saved successfully for ${normalizedChannel}`,
      );
      this.metrics.imageUploadsTotal.inc({
        method: 'from-url',
        result: 'success',
      });
      return { message: 'Image saved successfully' };
    } catch (err) {
      this.metrics.imageUploadsTotal.inc({
        method: 'from-url',
        result: 'failure',
      });
      if (err instanceof SsrfValidationError) {
        logger.warn(`[from-url] Rejected URL: ${url}`);
        this.metrics.ssrfBlockedTotal.inc({ route: 'from-url' });
        throw new BadRequestException('The given URL is not allowed');
      }
      if (err instanceof FetchFailedError) {
        logger.warn(`[from-url] Fetch failed: ${url}`);
        throw new BadGatewayException(
          'Image could not be loaded or was not a valid image',
        );
      }
      if (err instanceof InvalidImageError) {
        logger.warn(`[from-url] Fetched content is not a valid image: ${url}`);
        throw new UnsupportedMediaTypeException(
          'The fetched content is not a valid image',
        );
      }
      if (err instanceof ImageTooLargeError) {
        logger.warn(`[from-url] Fetched image dimensions too large: ${url}`);
        throw new UnprocessableEntityException(
          'The fetched image dimensions are too large to process',
        );
      }
      // Anything else is unexpected and not the caller's fault — let it
      // propagate to Nest's default exception handling (500) instead of
      // mislabeling it as a 400.
      logger.error(`[from-url] Unexpected error:`, err);
      throw err;
    }
  }

  // These two spacer-base-image routes must stay registered before
  // @Post(':channelName')/uploadImage below: both are single-segment path
  // patterns for the same set of HTTP methods, and NestJS (like Express)
  // matches routes in declaration order -- a wildcard param route
  // registered first would swallow `POST /images-local/spacer-base-image`
  // as if it were a normal per-channel upload (with channelName literally
  // "spacer-base-image") before this route ever got a chance to run.
  @Get('spacer-base-image')
  @Roles(OIDC_EDITOR_ROLE)
  @ApiOperation({
    summary:
      'Returns the shared base image used as a fallback for any spacer channel with no image of its own (local only)',
  })
  @ApiResponse({ status: 200, description: 'The image as a binary stream' })
  @ApiResponse({ status: 404, description: 'No base image has been set yet' })
  async getSpacerBaseImage(@Res() res: Response) {
    logger.log('[getSpacerBaseImage] Request received');
    const image = await this.imagesService.getImage(
      SPACER_BASE_IMAGE_CHANNEL_NAME,
    );
    if (!image) {
      throw new NotFoundException('No spacer base image has been set yet');
    }
    res.setHeader('Content-Type', image.mimeType);
    return res.send(image.image);
  }

  @Post('spacer-base-image')
  @Roles(OIDC_EDITOR_ROLE)
  @AuditAction('set-spacer-base-image')
  @ApiOperation({
    summary:
      'Sets the shared base image used as a fallback for spacer channels with no image of their own (local only)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: imageFileFilter,
    }),
    AuditLoggingInterceptor,
  )
  async uploadSpacerBaseImage(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    logger.log(
      `[uploadSpacerBaseImage] Request: fileSize=${file?.buffer?.length ?? 0}`,
    );
    if (!file || !file.buffer) {
      throw new BadRequestException('No file uploaded');
    }

    try {
      // Not tied to any live TeamSpeak channel, so this goes straight to
      // ImagesService.saveImage() -- no resolveUploadChannel()/live-channel
      // lookup needed, unlike every other upload endpoint in this file.
      const processed = await processImageForStorage(file.buffer);
      await this.imagesService.saveImage(
        SPACER_BASE_IMAGE_CHANNEL_NAME,
        processed.buffer,
        processed.mimeType,
        undefined,
        req.user?.sub,
      );
      logger.log('[uploadSpacerBaseImage] Base image saved successfully');
      return { message: 'Spacer base image set successfully' };
    } catch (err) {
      if (err instanceof InvalidImageError) {
        logger.warn(
          '[uploadSpacerBaseImage] Uploaded content is not a valid image',
        );
        throw new UnsupportedMediaTypeException(
          'The uploaded file is not a valid image',
        );
      }
      if (err instanceof ImageTooLargeError) {
        logger.warn(
          '[uploadSpacerBaseImage] Uploaded image dimensions too large',
        );
        throw new UnprocessableEntityException(
          'The uploaded image dimensions are too large to process',
        );
      }
      logger.error('[uploadSpacerBaseImage] Unexpected error:', err);
      throw err;
    }
  }

  @Post(':channelName')
  @Roles(OIDC_EDITOR_ROLE)
  @ApiOperation({ summary: 'Upload an image for the channel (local only)' })
  @ApiParam({ name: 'channelName', type: String })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @AuditAction('upload')
  // Enforce file size limits and allowed mime types, and log a success audit
  // entry once the upload actually completes.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: imageFileFilter,
    }),
    AuditLoggingInterceptor,
  )
  async uploadImage(
    @Param('channelName', ChannelNameValidationPipe) channelName: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    const normalizedChannel = normalizeChannelName(channelName);
    logger.log(
      `[uploadImage] Request: channelName=${normalizedChannel}, fileSize=${file?.buffer?.length ?? 0}`,
    );
    if (!file || !file.buffer) {
      logger.warn(`[uploadImage] No file uploaded`);
      this.metrics.imageUploadsTotal.inc({
        method: 'upload',
        result: 'failure',
      });
      throw new BadRequestException('No file uploaded');
    }
    if (!normalizedChannel) {
      logger.warn(`[uploadImage] channelName normalized to an empty string`);
      this.metrics.imageUploadsTotal.inc({
        method: 'upload',
        result: 'failure',
      });
      throw new BadRequestException('channelName is invalid');
    }

    let resolved: { channelId: string; channelName: string };
    try {
      resolved = await resolveUploadChannel(
        this.imagesService,
        normalizedChannel,
      );
    } catch (err) {
      this.metrics.imageUploadsTotal.inc({
        method: 'upload',
        result: 'failure',
      });
      if (err instanceof ChannelNotFoundError) {
        logger.warn(`[uploadImage] ${err.message}`);
        throw new BadRequestException(err.message);
      }
      if (err instanceof ChannelNameConflictError) {
        logger.warn(`[uploadImage] ${err.message}`);
        throw new ConflictException(err.message);
      }
      logger.error(`[uploadImage] TeamSpeak channel resolution failed:`, err);
      this.metrics.teamspeakErrorsTotal.inc({ operation: 'resolve-channel' });
      throw new ServiceUnavailableException(
        'TeamSpeak is currently unreachable',
      );
    }

    try {
      // `imageFileFilter` already did a cheap MIME-type-string pre-check,
      // but the client-supplied `file.mimetype`/bytes are otherwise
      // untrusted here -- a client that bypasses the cropping UI (or edits
      // the request) could send an arbitrarily-sized or malformed file.
      // `processImageForStorage()` fully decodes the bytes, enforces
      // dimensions, and center-crops/resizes to the fixed banner size
      // before anything is persisted.
      const processed = await processImageForStorage(file.buffer);
      await this.imagesService.saveImage(
        resolved.channelName,
        processed.buffer,
        processed.mimeType,
        resolved.channelId,
        req.user?.sub,
      );
      logger.log(
        `[uploadImage] Image saved successfully for ${normalizedChannel}`,
      );
      this.metrics.imageUploadsTotal.inc({
        method: 'upload',
        result: 'success',
      });
      return { message: 'Image saved successfully' };
    } catch (err) {
      this.metrics.imageUploadsTotal.inc({
        method: 'upload',
        result: 'failure',
      });
      if (err instanceof InvalidImageError) {
        logger.warn(`[uploadImage] Uploaded content is not a valid image`);
        throw new UnsupportedMediaTypeException(
          'The uploaded file is not a valid image',
        );
      }
      if (err instanceof ImageTooLargeError) {
        logger.warn(`[uploadImage] Uploaded image dimensions too large`);
        throw new UnprocessableEntityException(
          'The uploaded image dimensions are too large to process',
        );
      }
      logger.error(`[uploadImage] Unexpected error:`, err);
      throw err;
    }
  }

  @Get('options')
  @Roles(OIDC_ADMIN_ROLE)
  @ApiOperation({
    summary: 'Lists all images from the database (channelName, mimeType)',
  })
  async listOptions() {
    const options = await this.imagesService.listOptions();
    return { options };
  }

  @Get('img-from-url')
  @Roles(OIDC_EDITOR_ROLE)
  @ApiOperation({ summary: 'Proxy: returns an image from an external URL' })
  @ApiQuery({
    name: 'url',
    type: String,
    required: true,
    description: 'The external image URL',
    example: 'https://example.com/image.jpg',
  })
  @ApiResponse({
    status: 200,
    description: 'The image as a binary stream',
    content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 400, description: 'Invalid or missing URL' })
  @ApiResponse({
    status: 502,
    description: 'The URL passed validation but could not be fetched',
  })
  async proxyImage(@Query() query: ImgFromUrlQueryDto, @Res() res: Response) {
    const { url } = query;
    logger.log(`[img-from-url] Proxy request: url=${url}`);

    try {
      const { buffer, contentType } = await fetchImageSafely(url);
      res.setHeader('Content-Type', contentType);
      res.send(buffer);
      logger.log(`[img-from-url] Image proxied successfully: ${url}`);
    } catch (err) {
      if (err instanceof SsrfValidationError) {
        logger.warn(`[img-from-url] Rejected URL: ${url}`);
        this.metrics.ssrfBlockedTotal.inc({ route: 'img-from-url' });
        throw new BadRequestException('The given URL is not allowed');
      }
      if (err instanceof FetchFailedError) {
        logger.warn(`[img-from-url] Fetch failed: ${url}`);
        throw new BadGatewayException('Image could not be loaded');
      }
      logger.error(`[img-from-url] Unexpected error while loading:`, err);
      throw err;
    }
  }

  @Get('channels')
  @Roles(OIDC_EDITOR_ROLE)
  @ApiOperation({ summary: 'Returns a list of all channels (TeamSpeak)' })
  @ApiResponse({
    status: 200,
    description: 'List of channels',
    schema: {
      type: 'object',
      properties: {
        channels: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'TeamSpeak is currently unreachable',
  })
  async listChannels() {
    logger.log('[GET /images-local/channels] Request received');
    try {
      const result = await listChannelNames();
      return { channels: result };
    } catch (err) {
      logger.error('[GET /images-local/channels] Error:', err);
      this.metrics.teamspeakErrorsTotal.inc({ operation: 'list-channels' });
      throw new ServiceUnavailableException(
        'TeamSpeak is currently unreachable',
      );
    }
  }

  @Get('channels/banner-urls')
  @Roles(OIDC_EDITOR_ROLE)
  @ApiOperation({
    summary:
      "Returns each channel's current banner URL and whether it's managed by this server (local only)",
  })
  @ApiResponse({
    status: 200,
    description: 'Per-channel banner-management status',
    schema: {
      type: 'object',
      properties: {
        channels: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              bannerGfxUrl: { type: 'string', nullable: true },
              managed: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'TeamSpeak is currently unreachable',
  })
  async listChannelBannerUrls() {
    logger.log('[GET /images-local/channels/banner-urls] Request received');
    try {
      const liveChannels = await fetchLiveChannels();
      const channels = liveChannels.map((c) => ({
        name: normalizeChannelName(c.name),
        bannerGfxUrl: c.bannerGfxUrl,
        managed: isManagedByUs(c, this.publicBaseUrl),
      }));
      return { channels };
    } catch (err) {
      logger.error('[GET /images-local/channels/banner-urls] Error:', err);
      this.metrics.teamspeakErrorsTotal.inc({ operation: 'list-channels' });
      throw new ServiceUnavailableException(
        'TeamSpeak is currently unreachable',
      );
    }
  }

  @Patch(':channelName/banner-url')
  @Roles(OIDC_EDITOR_ROLE)
  @AuditAction('set-banner-url')
  @UseInterceptors(AuditLoggingInterceptor)
  @ApiOperation({
    summary:
      "Sets a channel's TeamSpeak banner URL to point at this server's managed image (local only)",
  })
  @ApiParam({ name: 'channelName', type: String })
  @ApiResponse({
    status: 400,
    description: 'No live channel matches this name',
  })
  @ApiResponse({
    status: 503,
    description: 'TeamSpeak is currently unreachable',
  })
  async setBannerUrl(
    @Param('channelName', ChannelNameValidationPipe) channelName: string,
  ) {
    const normalizedChannel = normalizeChannelName(channelName);
    logger.log(`[setBannerUrl] Request: channelName=${normalizedChannel}`);
    if (!normalizedChannel) {
      logger.warn(`[setBannerUrl] channelName normalized to an empty string`);
      throw new BadRequestException('channelName is invalid');
    }

    let channel: LiveChannel;
    try {
      channel = await findLiveChannelByName(normalizedChannel);
    } catch (err) {
      if (err instanceof ChannelNotFoundError) {
        logger.warn(`[setBannerUrl] ${err.message}`);
        throw new BadRequestException(err.message);
      }
      logger.error(`[setBannerUrl] TeamSpeak channel resolution failed:`, err);
      this.metrics.teamspeakErrorsTotal.inc({ operation: 'resolve-channel' });
      throw new ServiceUnavailableException(
        'TeamSpeak is currently unreachable',
      );
    }

    const url = expectedBannerUrl(channel.name, this.publicBaseUrl);
    try {
      await setChannelBannerUrl(channel.cid, url);
    } catch (err) {
      logger.error(`[setBannerUrl] Failed to set banner URL:`, err);
      this.metrics.teamspeakErrorsTotal.inc({ operation: 'set-banner-url' });
      throw new ServiceUnavailableException(
        'TeamSpeak is currently unreachable',
      );
    }

    logger.log(
      `[setBannerUrl] Banner URL set for ${normalizedChannel}: ${url}`,
    );
    return { message: 'Banner URL set successfully', bannerGfxUrl: url };
  }

  @Post('channels/apply-banner-urls')
  @Roles(OIDC_EDITOR_ROLE)
  @AuditAction('apply-banner-urls')
  @UseInterceptors(AuditLoggingInterceptor)
  @ApiOperation({
    summary:
      'Sets the banner URL for every channel not already managed by this server (local only)',
  })
  @ApiResponse({
    status: 200,
    description: 'Summary of what was changed',
    schema: {
      type: 'object',
      properties: {
        updated: { type: 'array', items: { type: 'string' } },
        alreadyManaged: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'TeamSpeak is currently unreachable',
  })
  async applyBannerUrls() {
    logger.log('[applyBannerUrls] Request received');
    try {
      const result = await applyBannerUrlsForAllChannels(this.publicBaseUrl);
      logger.log(
        `[applyBannerUrls] Updated ${result.updated.length}, already managed ${result.alreadyManaged.length}`,
      );
      return result;
    } catch (err) {
      logger.error('[applyBannerUrls] Error:', err);
      this.metrics.teamspeakErrorsTotal.inc({ operation: 'apply-banner-urls' });
      throw new ServiceUnavailableException(
        'TeamSpeak is currently unreachable',
      );
    }
  }
}
