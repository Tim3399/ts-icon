import {
  Controller,
  Get,
  Query,
  Res,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  BadGatewayException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
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
import { Express, Response } from 'express';

import { TeamSpeak } from 'ts3-nodejs-library';
import {
  TS_HOST,
  TS_QUERY_PORT,
  TS_SERVER_PORT,
  getTeamSpeakCredentials,
  OIDC_ADMIN_ROLE,
  OIDC_EDITOR_ROLE,
} from '../../config';
import { normalizeChannelName } from '../util/util';
import {
  fetchImageSafely,
  SsrfValidationError,
  FetchFailedError,
} from './safe-url-fetcher';
import { Roles } from '../auth/roles.decorator';
import { ImageFromUrlDto } from './dto/image-from-url.dto';
import { ImgFromUrlQueryDto } from './dto/img-from-url-query.dto';
import { ChannelNameValidationPipe } from './dto/channel-name-validation.pipe';
import {
  AuditAction,
  AuditLoggingInterceptor,
} from './audit-logging.interceptor';

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

async function listChannels(): Promise<string[]> {
  logger.log('[listChannels] Starting connection to TeamSpeak...');
  const { username, password } = getTeamSpeakCredentials();
  const ts3 = await TeamSpeak.connect({
    host: TS_HOST,
    queryport: TS_QUERY_PORT,
    serverport: TS_SERVER_PORT,
    username,
    password,
  });

  ts3.on('error', (err) => {
    logger.error('[listChannels] TeamSpeak client error:', err);
  });

  logger.log('[listChannels] Connection to TeamSpeak established.');
  const channels = await ts3.channelList();
  const channelNames = channels.map((c) => normalizeChannelName(c.name));
  logger.log(`[listChannels] Found channels: ${channelNames.join(', ')}`);
  await ts3.quit();
  logger.log('[listChannels] Connection to TeamSpeak closed.');
  return channelNames;
}

@ApiTags('images-local')
@Controller('images-local')
export class ImagesLocalController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('from-url')
  @Roles(OIDC_EDITOR_ROLE)
  @AuditAction('from-url')
  @UseInterceptors(AuditLoggingInterceptor)
  @ApiOperation({
    summary: 'Upload an image from a URL for the channel (local only)',
  })
  @ApiBody({ type: ImageFromUrlDto })
  async uploadImageFromUrl(@Body() body: ImageFromUrlDto) {
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
      throw new BadRequestException('channelName is invalid');
    }

    try {
      const { buffer, contentType } = await fetchImageSafely(url);
      await this.imagesService.saveImage(
        normalizedChannel,
        buffer,
        contentType,
      );
      logger.log(
        `[from-url] Image saved successfully for ${normalizedChannel}`,
      );
      return { message: 'Image saved successfully' };
    } catch (err) {
      if (err instanceof SsrfValidationError) {
        logger.warn(`[from-url] Rejected URL: ${url}`);
        throw new BadRequestException('The given URL is not allowed');
      }
      if (err instanceof FetchFailedError) {
        logger.warn(`[from-url] Fetch failed: ${url}`);
        throw new BadGatewayException(
          'Image could not be loaded or was not a valid image',
        );
      }
      // Anything else is unexpected and not the caller's fault — let it
      // propagate to Nest's default exception handling (500) instead of
      // mislabeling it as a 400.
      logger.error(`[from-url] Unexpected error:`, err);
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
  ) {
    const normalizedChannel = normalizeChannelName(channelName);
    logger.log(
      `[uploadImage] Request: channelName=${normalizedChannel}, fileSize=${file?.buffer?.length ?? 0}`,
    );
    if (!file || !file.buffer) {
      logger.warn(`[uploadImage] No file uploaded`);
      throw new BadRequestException('No file uploaded');
    }
    if (!normalizedChannel) {
      logger.warn(`[uploadImage] channelName normalized to an empty string`);
      throw new BadRequestException('channelName is invalid');
    }
    await this.imagesService.saveImage(
      normalizedChannel,
      file.buffer,
      file.mimetype,
    );
    logger.log(
      `[uploadImage] Image saved successfully for ${normalizedChannel}`,
    );
    return { message: 'Image saved successfully' };
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
      const result = await listChannels();
      return { channels: result };
    } catch (err) {
      logger.error('[GET /images-local/channels] Error:', err);
      throw new ServiceUnavailableException(
        'TeamSpeak is currently unreachable',
      );
    }
  }
}
