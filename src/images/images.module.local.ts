import { Module } from '@nestjs/common';
import { ImagesLocalController } from './images.controller.local';
import { ImagesService } from './images.service';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [MetricsModule],
  controllers: [ImagesLocalController],
  providers: [ImagesService],
})
export class ImagesModuleLocal {}
