import { Module } from '@nestjs/common'
import { ImagesLocalController } from './images.controller.local'
import { ImagesService } from './images.service'

@Module({
  controllers: [ImagesLocalController],
  providers: [ImagesService],
})
export class ImagesModuleLocal {}