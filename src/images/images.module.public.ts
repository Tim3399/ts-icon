import { Module } from '@nestjs/common'
import { ImagesPublicController } from './images.controller.public'
import { ImagesService } from './images.service'

@Module({
  controllers: [ImagesPublicController],
  providers: [ImagesService],
})
export class ImagesModulePublic {}