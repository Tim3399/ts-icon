
import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { ImagesModuleLocal } from './images/images.module.local'
import { AppController } from './app.controller'
import { AppService } from './app.service'

@Module({
  imports: [PrismaModule, ImagesModuleLocal],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
