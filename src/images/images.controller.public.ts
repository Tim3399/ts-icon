import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ImagesService } from './images.service';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';

import { normalizeChannelName } from '../util/util';
import { ChannelNameValidationPipe } from './dto/channel-name-validation.pipe';

const logger = new Logger('ImagesPublicController');

@ApiTags('images')
@Controller('images')
export class ImagesPublicController {
  constructor(private readonly imagesService: ImagesService) {}

  @Get(':channelName')
  @ApiOperation({ summary: 'Fetch channel image from the database' })
  @ApiParam({ name: 'channelName', type: String })
  async getImage(
    @Param('channelName', ChannelNameValidationPipe) channelName: string,
    @Res() res: Response,
  ) {
    const normalizedChannel = normalizeChannelName(channelName);
    logger.log(`[getImage] Request: channelName=${normalizedChannel}`);
    const image = await this.imagesService.getImage(normalizedChannel);
    if (!image) {
      logger.warn(`[getImage] Image not found for ${normalizedChannel}`);
      throw new NotFoundException('Image not found');
    }
    res.setHeader('Content-Type', image.mimeType);
    // Set Cache-Control header for 1 day (86400 seconds)
    res.setHeader('Cache-Control', 'public, max-age=86400');
    logger.log(`[getImage] Image served successfully for ${normalizedChannel}`);
    return res.send(image.image);
  }
}
