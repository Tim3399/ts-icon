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
import axios from 'axios'
import { IsString, IsUrl } from 'class-validator'
import { URL } from 'url'

import { TeamSpeak } from 'ts3-nodejs-library'
import { TS_HOST, TS_QUERY_PORT, TS_SERVER_PORT, TS_USERNAME, TS_USERPASSWORD } from '../../config'
import { normalizeChannelName } from '../util/util'

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const AXIOS_TIMEOUT = 5000 // 5s
const AXIOS_MAX_CONTENT = 10 * 1024 * 1024 // 10 MB

function imageFileFilter(req: any, file: Express.Multer.File, cb: (err: Error | null, acceptFile: boolean) => void) {
  if (!file || !file.mimetype) return cb(new Error('Invalid file'), false)
  if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) return cb(null, true)
  return cb(new Error('Invalid file type'), false)
}

export class ImageFromUrlDto {
  @ApiProperty({ example: 'mein-channel' })
  @IsString()
  channelName!: string

  @ApiProperty({ example: 'https://example.com/bild.png' })
  @IsUrl()
  url!: string
}



async function fetchImageBufferFromUrl(url: string): Promise<{
  buffer: Buffer
  contentType: string
}> {
  console.log(`[fetchImageBufferFromUrl] Lade Bild von: ${url}`)
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: AXIOS_TIMEOUT, maxContentLength: AXIOS_MAX_CONTENT })

  const contentType = response.headers['content-type']
  if (!contentType?.startsWith('image/')) {
    console.warn(`[fetchImageBufferFromUrl] Kein Bild: ${url}`)
    throw new Error('Kein gültiges Bild')
  }

  return {
    buffer: Buffer.from(response.data),
    contentType,
  }
}

async function listChannels() {
  console.log('[listChannels] Starte Verbindung zu TeamSpeak...');
  try {
    const ts3 = await TeamSpeak.connect({
      host: TS_HOST,
      queryport: TS_QUERY_PORT,
      serverport: TS_SERVER_PORT,
      username: TS_USERNAME,
      password: TS_USERPASSWORD,
    });

    ts3.on('error', (err) => {
      console.error('[listChannels] TeamSpeak-Client-Fehler:', err);
    });

    console.log('[listChannels] Verbindung zu TeamSpeak hergestellt.');
    const channels = await ts3.channelList();
    const channelNames = channels.map(c => normalizeChannelName(c.name));
    console.log('[listChannels] Gefundene Channels:', channelNames);
    await ts3.quit();
    console.log('[listChannels] Verbindung zu TeamSpeak beendet.');
    return channelNames;
  } catch (err) {
    console.error('[listChannels] Fehler beim Verbinden/Abrufen der Channels:', err);
    return [];
  }
}

@ApiTags('images-local')
@Controller('images-local')
export class ImagesLocalController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('from-url')
  @ApiOperation({ summary: 'Lade ein Bild von einer URL für den Channel hoch (nur lokal)' })
  @ApiBody({ type: ImageFromUrlDto })
  async uploadImageFromUrl(
    @Body() body: ImageFromUrlDto
  ) {
    const { channelName, url } = body
    const normalizedChannel = normalizeChannelName(channelName);
    console.log(`[from-url] Request: channelName=${normalizedChannel}, url=${url}`)
    if (!normalizedChannel || !url) {
      console.warn(`[from-url] Fehlende Parameter`)
      throw new BadRequestException('channelName und url sind erforderlich')
    }

    try {
      const { buffer, contentType } = await fetchImageBufferFromUrl(url)
      await this.imagesService.saveImage(normalizedChannel, buffer, contentType)
      console.log(`[from-url] Bild erfolgreich gespeichert für ${normalizedChannel}`)
      return { message: 'Bild erfolgreich gespeichert' }
    } catch (err: any) {
      console.error(`[from-url] Fehler:`, err)
      throw new BadRequestException('Bild konnte nicht geladen oder war kein gültiges Bild')
    }
  }

  @Post(':channelName')
  @ApiOperation({ summary: 'Lade ein Bild für den Channel hoch (nur lokal)' })
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
    console.log(`[uploadImage] Request: channelName=${normalizedChannel}, fileSize=${file?.buffer?.length ?? 0}`)
    if (!file || !file.buffer) {
      console.warn(`[uploadImage] Keine Datei hochgeladen`)
      throw new BadRequestException('Keine Datei hochgeladen')
    }
    await this.imagesService.saveImage(normalizedChannel, file.buffer, file.mimetype)
    console.log(`[uploadImage] Bild erfolgreich gespeichert für ${normalizedChannel}`)
    return { message: 'Bild erfolgreich gespeichert' }
  }

  @Get('img-from-url')
  @ApiOperation({ summary: 'Proxy: Liefert ein Bild von einer externen URL zurück' })
  @ApiParam({
    name: 'url',
    type: String,
    required: true,
    description: 'Die externe Bild-URL (als Query-Parameter)',
    example: 'https://example.com/image.jpg',
  })
  @ApiResponse({
    status: 200,
    description: 'Das Bild als Binary-Stream',
    content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 400, description: 'Ungültige oder fehlende URL' })
  async proxyImage(@Query('url') url: string, @Res() res: Response) {
    console.log(`[img-from-url] Proxy-Request: url=${url}`)
    if (!url) {
      console.warn(`[img-from-url] Fehlender Query-Parameter "url"`)
      throw new BadRequestException('Query-Parameter "url" fehlt')
    }

    // Sicherstellen, dass es eine valide URL ist
    try {
      new URL(url)
    } catch {
      console.warn(`[img-from-url] Ungültige URL: ${url}`)
      throw new BadRequestException('Ungültige URL')
    }

    try {
      const response = await axios.get(url, { responseType: 'arraybuffer', timeout: AXIOS_TIMEOUT, maxContentLength: AXIOS_MAX_CONTENT })
      const contentType = response.headers['content-type']

      if (!contentType?.startsWith('image/')) {
        console.warn(`[img-from-url] Kein Bild: ${url}`)
        throw new BadRequestException('Die angegebene URL liefert kein Bild')
      }

      res.setHeader('Content-Type', contentType)
      res.send(Buffer.from(response.data))
      console.log(`[img-from-url] Bild erfolgreich proxied: ${url}`)
    } catch (err) {
      console.error(`[img-from-url] Fehler beim Laden:`, err)
      throw new BadRequestException('Bild konnte nicht geladen werden')
    }
  }

  @Get('channels')
  @ApiOperation({ summary: 'Liefert eine Liste aller Channels (TeamSpeak)' })
  @ApiResponse({
    status: 200,
    description: 'Liste der Channels oder Fehlermeldung',
    schema: {
      type: 'object',
      properties: {
        channels: { type: 'array', items: { type: 'string' } },
        error: { type: 'string' }
      }
    }
  })
  async listChannels() {
    console.log('[GET /images-local/channels] Anfrage erhalten');
    try {
      const result = await listChannels();
      return { channels: result };
    } catch (err) {
      console.error('[GET /images-local/channels] Fehler:', err);
      return {
        channels: [],
        error: 'TeamSpeak nicht erreichbar oder Fehler beim Abrufen der Channels'
      };
    }
  }
}

