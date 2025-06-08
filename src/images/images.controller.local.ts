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

export class ImageFromUrlDto {
  @ApiProperty({ example: 'mein-channel' })
  @IsString()
  channelName!: string

  @ApiProperty({ example: 'https://example.com/bild.png' })
  @IsUrl()
  url!: string
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
    if (!channelName || !url) {
      throw new BadRequestException('channelName und url sind erforderlich')
    }

    try {
      const { buffer, contentType } = await fetchImageBufferFromUrl(url)
      await this.imagesService.saveImage(channelName, buffer, contentType)
      return { message: 'Bild erfolgreich gespeichert' }
    } catch (err: any) {
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
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('channelName') channelName: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Keine Datei hochgeladen')
    }
    await this.imagesService.saveImage(channelName, file.buffer, file.mimetype)
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
    if (!url) {
      throw new BadRequestException('Query-Parameter "url" fehlt')
    }

    // Sicherstellen, dass es eine valide URL ist
    try {
      new URL(url)
    } catch {
      throw new BadRequestException('Ungültige URL')
    }

    try {
      const response = await axios.get(url, { responseType: 'arraybuffer' })
      const contentType = response.headers['content-type']

      if (!contentType?.startsWith('image/')) {
        throw new BadRequestException('Die angegebene URL liefert kein Bild')
      }

      res.setHeader('Content-Type', contentType)
      res.send(Buffer.from(response.data))
    } catch {
      throw new BadRequestException('Bild konnte nicht geladen werden')
    }
  }
}

async function fetchImageBufferFromUrl(url: string): Promise<{
  buffer: Buffer
  contentType: string
}> {
  const response = await axios.get(url, { responseType: 'arraybuffer' })

  const contentType = response.headers['content-type']
  if (!contentType?.startsWith('image/')) {
    throw new Error('Kein gültiges Bild')
  }

  return {
    buffer: Buffer.from(response.data),
    contentType,
  }
}