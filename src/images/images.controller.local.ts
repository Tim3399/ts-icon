import {
  Controller,
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
} from '@nestjs/swagger'
import { Express } from 'express'
import axios from 'axios'
import { IsString, IsUrl } from 'class-validator'

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

    // Bild von der URL holen
    let response
    try {
      response = await axios.get(url, { responseType: 'arraybuffer' })
    } catch (e) {
      throw new BadRequestException('Bild konnte nicht geladen werden')
    }

    const contentType = response.headers['content-type']
    if (!contentType?.startsWith('image/')) {
      throw new BadRequestException('Die URL liefert kein Bild')
    }

    await this.imagesService.saveImage(
      channelName,
      Buffer.from(response.data),
      contentType
    )

    return { message: 'Bild erfolgreich gespeichert' }
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
}