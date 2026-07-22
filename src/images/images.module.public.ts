import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ImagesPublicController } from './images.controller.public';
import { ImagesService } from './images.service';

@Module({
  imports: [
    // Rate limit the public image endpoint only: a short burst allowance
    // plus an overall per-minute/IP cap. This module is only ever
    // bootstrapped by the `public` app (main.public.ts), so the guard below
    // has no effect on the `local` admin app.
    //
    // Calibrated for real TeamSpeak client behavior, not just "some
    // reasonable-looking number": a TS3 client fetches the banner for
    // *every* channel visible in the tree as soon as it connects, not just
    // the one the user is currently in -- so a single real connect from one
    // IP can burst to roughly the server's total channel count almost at
    // once. The original 5 req/sec burst limit was tuned for a generic
    // "prevent scraping" case and started rejecting legitimate banner loads
    // outright on any server with more than 5 channels. This project's own
    // documented scale is ~100 channels max on a single deployment; both
    // limits below give real headroom above that (including a few users
    // behind the same shared/NAT IP connecting around the same time) while
    // still bounding actual abuse far below what a real scraping pattern
    // would look like.
    ThrottlerModule.forRoot([
      { name: 'burst', ttl: 2000, limit: 150 },
      { name: 'per-minute', ttl: 60000, limit: 600 },
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
