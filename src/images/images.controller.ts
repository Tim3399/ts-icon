import {
  Controller,
  Get,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  Res,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Express, Response } from 'express'
import { ImagesService } from './images.service'
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger'

@ApiTags('images')
@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  // 🔽 GET: Bild abrufen
  @Get(':channelName')
  @ApiOperation({ summary: 'Hole Channel-Bild aus der Datenbank' })
  @ApiParam({ name: 'channelName', type: String })
  async getImage(
    @Param('channelName') channelName: string,
    @Res() res: Response,
  ) {
    const image = await this.imagesService.getImage(channelName)

    if (!image) {
      throw new NotFoundException('Bild nicht gefunden')
    }

    res.setHeader('Content-Type', image.mimeType)
    return res.send(image.image)
  }

  // 🔼 POST: Bild hochladen oder überschreiben
  @Post(':channelName')
  @ApiOperation({ summary: 'Lade ein Bild für den Channel hoch (überschreibt)' })
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
