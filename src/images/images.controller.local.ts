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
  Body,
  Logger,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ImagesService } from './images.service'
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiConsumes,
  ApiBody,
  ApiProperty,
  ApiResponse,
} from '@nestjs/swagger'
import { Express, Response } from 'express'
import { IsString, IsUrl } from 'class-validator'

import { TeamSpeak } from 'ts3-nodejs-library'
import { TS_HOST, TS_QUERY_PORT, TS_SERVER_PORT, getTeamSpeakCredentials } from '../../config'
import { normalizeChannelName } from '../util/util'
import { fetchImageSafely, SsrfValidationError, FetchFailedError } from './safe-url-fetcher'

const logger = new Logger('ImagesLocalController')

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

function imageFileFilter(req: unknown, file: Express.Multer.File, cb: (err: Error | null, acceptFile: boolean) => void) {
  if (!file || !file.mimetype) return cb(new Error('Invalid file'), false)
  if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) return cb(null, true)
  return cb(new Error('Invalid file type'), false)
}

export class ImageFromUrlDto {
  @ApiProperty({ example: 'my-channel' })
  @IsString()
  channelName!: string

  @ApiProperty({ example: 'https://example.com/image.png' })
  @IsUrl()
  url!: string
}



async function listChannels() {
  logger.log('[listChannels] Starting connection to TeamSpeak...');
  try {
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
    const channelNames = channels.map(c => normalizeChannelName(c.name));
    logger.log(`[listChannels] Found channels: ${channelNames.join(', ')}`);
    await ts3.quit();
    logger.log('[listChannels] Connection to TeamSpeak closed.');
    return channelNames;
  } catch (err) {
    logger.error('[listChannels] Error connecting to / fetching channels:', err);
    return [];
  }
}

@ApiTags('images-local')
@Controller('images-local')
export class ImagesLocalController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('from-url')
  @ApiOperation({ summary: 'Upload an image from a URL for the channel (local only)' })
  @ApiBody({ type: ImageFromUrlDto })
  async uploadImageFromUrl(
    @Body() body: ImageFromUrlDto
  ) {
    const { channelName, url } = body
    const normalizedChannel = normalizeChannelName(channelName);
    logger.log(`[from-url] Request: channelName=${normalizedChannel}, url=${url}`)
    if (!normalizedChannel || !url) {
      logger.warn(`[from-url] Missing parameters`)
      throw new BadRequestException('channelName and url are required')
    }

    try {
      const { buffer, contentType } = await fetchImageSafely(url)
      await this.imagesService.saveImage(normalizedChannel, buffer, contentType)
      logger.log(`[from-url] Image saved successfully for ${normalizedChannel}`)
      return { message: 'Image saved successfully' }
    } catch (err) {
      if (err instanceof SsrfValidationError) {
        logger.warn(`[from-url] Rejected URL: ${url}`)
        throw new BadRequestException('The given URL is not allowed')
      }
      if (err instanceof FetchFailedError) {
        logger.warn(`[from-url] Fetch failed: ${url}`)
        throw new BadRequestException('Image could not be loaded or was not a valid image')
      }
      logger.error(`[from-url] Unexpected error:`, err)
      throw new BadRequestException('Image could not be loaded or was not a valid image')
    }
  }

  @Post(':channelName')
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
  // Enforce file size limits and allowed mime types
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE }, fileFilter: imageFileFilter }))
  async uploadImage(
    @Param('channelName') channelName: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const normalizedChannel = normalizeChannelName(channelName);
    logger.log(`[uploadImage] Request: channelName=${normalizedChannel}, fileSize=${file?.buffer?.length ?? 0}`)
    if (!file || !file.buffer) {
      logger.warn(`[uploadImage] No file uploaded`)
      throw new BadRequestException('No file uploaded')
    }
    await this.imagesService.saveImage(normalizedChannel, file.buffer, file.mimetype)
    logger.log(`[uploadImage] Image saved successfully for ${normalizedChannel}`)
    return { message: 'Image saved successfully' }
  }

  @Get('options')
  @ApiOperation({ summary: 'Lists all images from the database (channelName, mimeType)' })
  async listOptions() {
    const options = await this.imagesService.listOptions()
    return { options }
  }

  @Get('img-from-url')
  @ApiOperation({ summary: 'Proxy: returns an image from an external URL' })
  @ApiParam({
    name: 'url',
    type: String,
    required: true,
    description: 'The external image URL (as a query parameter)',
    example: 'https://example.com/image.jpg',
  })
  @ApiResponse({
    status: 200,
    description: 'The image as a binary stream',
    content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 400, description: 'Invalid or missing URL' })
  async proxyImage(@Query('url') url: string, @Res() res: Response) {
    logger.log(`[img-from-url] Proxy request: url=${url}`)
    if (!url) {
      logger.warn(`[img-from-url] Missing query parameter "url"`)
      throw new BadRequestException('Query parameter "url" is missing')
    }

    try {
      const { buffer, contentType } = await fetchImageSafely(url)
      res.setHeader('Content-Type', contentType)
      res.send(buffer)
      logger.log(`[img-from-url] Image proxied successfully: ${url}`)
    } catch (err) {
      if (err instanceof SsrfValidationError) {
        logger.warn(`[img-from-url] Rejected URL: ${url}`)
        throw new BadRequestException('The given URL is not allowed')
      }
      if (err instanceof FetchFailedError) {
        logger.warn(`[img-from-url] Fetch failed: ${url}`)
        throw new BadRequestException('Image could not be loaded')
      }
      logger.error(`[img-from-url] Unexpected error while loading:`, err)
      throw new BadRequestException('Image could not be loaded')
    }
  }

  @Get('channels')
  @ApiOperation({ summary: 'Returns a list of all channels (TeamSpeak)' })
  @ApiResponse({
    status: 200,
    description: 'List of channels or error message',
    schema: {
      type: 'object',
      properties: {
        channels: { type: 'array', items: { type: 'string' } },
        error: { type: 'string' }
      }
    }
  })
  async listChannels() {
    logger.log('[GET /images-local/channels] Request received');
    try {
      const result = await listChannels();
      return { channels: result };
    } catch (err) {
      logger.error('[GET /images-local/channels] Error:', err);
      return {
        channels: [],
        error: 'TeamSpeak unreachable or error fetching channels'
      };
    }
  }
}

