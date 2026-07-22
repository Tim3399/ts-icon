import { Module } from '@nestjs/common';
import { ImagesLocalController } from './images.controller.local';
import { ChannelWallpaperController } from './channel-wallpaper.controller';
import { ImagesService } from './images.service';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [MetricsModule],
  controllers: [ImagesLocalController, ChannelWallpaperController],
  providers: [ImagesService],
})
export class ImagesModuleLocal {}
