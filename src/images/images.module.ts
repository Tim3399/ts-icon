import { Module } from '@nestjs/common'
import { ImagesPublicController } from './images.controller.public'
import { ImagesLocalController } from './images.controller.local'
import { ImagesService } from './images.service'

@Module({
  controllers: [ImagesPublicController, ImagesLocalController],
  providers: [ImagesService],
})
export class ImagesModule {}