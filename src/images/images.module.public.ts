import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { ImagesPublicController } from './images.controller.public'
import { ImagesService } from './images.service'

@Module({
  imports: [
    // Rate limit the public image endpoint only: a short burst allowance
    // plus an overall ~60 requests/minute/IP cap. This module is only ever
    // bootstrapped by the `public` app (main.public.ts), so the guard below
    // has no effect on the `local` admin app.
    ThrottlerModule.forRoot([
      { name: 'burst', ttl: 1000, limit: 5 },
      { name: 'per-minute', ttl: 60000, limit: 60 },
    ]),
  ],
  controllers: [ImagesPublicController],
  providers: [
    ImagesService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class ImagesModulePublic {}