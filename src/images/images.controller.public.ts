import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common'
import { ImagesService } from './images.service'
import { Response } from 'express'
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger'

@ApiTags('images')
@Controller('images')
export class ImagesPublicController {
  constructor(private readonly imagesService: ImagesService) {}

  @Get(':channelName')
  @ApiOperation({ summary: 'Hole Channel-Bild aus der Datenbank' })
  @ApiParam({ name: 'channelName', type: String })
  async getImage(
    @Param('channelName') channelName: string,
    @Res() res: Response,
  ) {
    console.log(`[getImage] Request: channelName=${channelName}`)
    const image = await this.imagesService.getImage(channelName)
    if (!image) {
      console.warn(`[getImage] Bild nicht gefunden für ${channelName}`)
      throw new NotFoundException('Bild nicht gefunden')
    }
    res.setHeader('Content-Type', image.mimeType)
    console.log(`[getImage] Bild erfolgreich geliefert für ${channelName}`)
    return res.send(image.image)
  }
}