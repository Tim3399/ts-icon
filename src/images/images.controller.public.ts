import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common'
import { ImagesService } from './images.service'
import { Response } from 'express'
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger'

import { normalizeChannelName } from '../util/util'

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
    const normalizedChannel = normalizeChannelName(channelName)
    console.log(`[getImage] Request: channelName=${normalizedChannel}`)
    const image = await this.imagesService.getImage(normalizedChannel)
    if (!image) {
      console.warn(`[getImage] Bild nicht gefunden für ${normalizedChannel}`)
      throw new NotFoundException('Bild nicht gefunden')
    }
    res.setHeader('Content-Type', image.mimeType)
    console.log(`[getImage] Bild erfolgreich geliefert für ${normalizedChannel}`)
    return res.send(image.image)
  }
}