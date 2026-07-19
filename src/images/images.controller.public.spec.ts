import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { ImagesModulePublic } from './images.module.public';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

// Exercises the real `@nestjs/throttler` configuration wired up in
// `ImagesModulePublic` (two named limiters, `burst` and `per-minute`, applied
// globally via `APP_GUARD`/`ThrottlerGuard`) against real HTTP requests, in
// the same style as `test/app.e2e-spec.ts`. The point of these tests is the
// throttler's behavior, not the image lookup itself, so `PrismaService` is
// replaced with a mock that always reports "no image found" — a 404 from the
// route handler is a perfectly fine response to rate-limit-test against,
// since the throttler guard runs before the handler regardless of what the
// handler would have returned.
describe('Public images app rate limiting (e2e)', () => {
  let app: INestApplication;

  const mockPrismaService = {
    channelImage: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ImagesModulePublic, PrismaModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('allows requests under the burst limit through to the route handler', async () => {
    // The burst limiter allows 5 requests/second; each of these hits the
    // handler (which 404s, since the mocked Prisma lookup always returns
    // null) rather than being blocked by the throttler.
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer() as Server)
        .get('/images/some-channel')
        .expect(404);
    }
  });

  it('reports name-suffixed X-RateLimit headers on requests that pass the throttler', async () => {
    // `@nestjs/throttler`'s `ThrottlerGuard` only attaches `X-RateLimit-*`
    // headers on requests it lets through (it throws before reaching that
    // code path once a request is actually blocked) — checked directly
    // against the installed `@nestjs/throttler` source
    // (`ThrottlerGuard.handleRequest`) rather than assumed. Every header
    // name is suffixed with the triggering limiter's name unless that
    // limiter is literally named `'default'`; neither of this module's two
    // limiters (`burst`, `per-minute`) is, so both sets of headers appear,
    // name-suffixed, on every allowed request.
    const res = await request(app.getHttpServer() as Server)
      .get('/images/some-channel')
      .expect(404);

    expect(res.headers['x-ratelimit-limit-burst']).toBe('5');
    expect(res.headers['x-ratelimit-remaining-burst']).toBe('4');
    expect(res.headers['x-ratelimit-limit-per-minute']).toBe('60');
    expect(res.headers['x-ratelimit-remaining-per-minute']).toBe('59');
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('returns 429 with a name-suffixed Retry-After header once the burst limit is exceeded', async () => {
    const server = app.getHttpServer() as Server;

    // First 5 requests consume the whole burst allowance (5 req/sec); the
    // 6th, made within the same second, must be blocked by the burst
    // limiter specifically (the per-minute limiter, 60 req/min, has no
    // reason to trip yet).
    for (let i = 0; i < 5; i++) {
      await request(server).get('/images/some-channel').expect(404);
    }

    const blocked = await request(server)
      .get('/images/some-channel')
      .expect(429);

    // Confirmed by reading `@nestjs/throttler`'s
    // `ThrottlerGuard.getThrottlerSuffix`: it only omits the suffix for a
    // limiter literally named `'default'`. Neither of this module's
    // limiters is, so a 429 always carries `Retry-After-burst` (or
    // `Retry-After-per-minute`, for the other limiter), never a bare
    // `Retry-After` — asserting against the actual observed header name
    // here rather than assuming it.
    expect(blocked.headers['retry-after-burst']).toBeDefined();
    expect(blocked.headers['retry-after']).toBeUndefined();
  });
});
