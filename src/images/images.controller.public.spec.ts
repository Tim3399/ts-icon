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

  it('allows a full 100-channel-tree-sized burst through to the route handler', async () => {
    // The burst limiter allows 150 requests/2s -- calibrated to comfortably
    // cover a real TeamSpeak client fetching every channel's banner at once
    // on connect (this project's documented scale is ~100 channels max),
    // not just a handful. Each of these hits the handler (which 404s, since
    // the mocked Prisma lookup always returns null) rather than being
    // blocked by the throttler.
    for (let i = 0; i < 100; i++) {
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

    expect(res.headers['x-ratelimit-limit-burst']).toBe('150');
    expect(res.headers['x-ratelimit-remaining-burst']).toBe('149');
    expect(res.headers['x-ratelimit-limit-per-minute']).toBe('600');
    expect(res.headers['x-ratelimit-remaining-per-minute']).toBe('599');
    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('returns 429 with a name-suffixed Retry-After header once the burst limit is exceeded', async () => {
    const server = app.getHttpServer() as Server;

    // First 150 requests consume the whole burst allowance (150 req/2s);
    // the next one, made within the same window, must be blocked by the
    // burst limiter specifically (the per-minute limiter, 600 req/min, has
    // no reason to trip yet).
    for (let i = 0; i < 150; i++) {
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

// Exercises the ETag/If-None-Match/304 behavior added on top of the existing
// Cache-Control header. A separate `describe`/mocked PrismaService from the
// rate-limiting block above, since these tests need the mock to actually
// return a row (rather than always 404) — matches this file's existing style
// of mocking PrismaService directly rather than the ImagesService above it.
describe('Public images app conditional GET (ETag / If-None-Match)', () => {
  let app: INestApplication;

  const IMAGE_BYTES = Buffer.from('fake-etag-test-image-bytes');
  const CONTENT_HASH = 'abc123fakehash';

  const mockPrismaService = {
    channelImage: {
      findUnique: jest.fn().mockResolvedValue({
        image: new Uint8Array(IMAGE_BYTES),
        mimeType: 'image/png',
        contentHash: CONTENT_HASH,
      }),
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

  it('returns 200 with an ETag and the existing Cache-Control header when no If-None-Match is sent', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/images/some-channel')
      .expect(200);

    expect(res.headers['etag']).toBe(`"${CONTENT_HASH}"`);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    expect(res.headers['content-type']).toContain('image/png');
  });

  it('returns 200 (not 304) when If-None-Match does not match the current content hash', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/images/some-channel')
      .set('If-None-Match', '"some-other-hash"')
      .expect(200);

    expect(res.headers['etag']).toBe(`"${CONTENT_HASH}"`);
  });

  it('returns 304 with no body when If-None-Match matches the current content hash', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/images/some-channel')
      .set('If-None-Match', `"${CONTENT_HASH}"`)
      .expect(304);

    expect(res.headers['etag']).toBe(`"${CONTENT_HASH}"`);
    expect(res.headers['cache-control']).toBe('public, max-age=86400');
    // A 304 must carry no body.
    expect(res.headers['content-length'] ?? '0').toBe('0');
    expect(res.text).toBe('');
  });

  it('returns 304 when If-None-Match is a comma-separated list containing the current content hash', async () => {
    await request(app.getHttpServer() as Server)
      .get('/images/some-channel')
      .set('If-None-Match', `"unrelated-hash", "${CONTENT_HASH}"`)
      .expect(304);
  });

  it('returns 304 for a wildcard If-None-Match', async () => {
    await request(app.getHttpServer() as Server)
      .get('/images/some-channel')
      .set('If-None-Match', '*')
      .expect(304);
  });
});

// A spacer channel with no image of its own falls back to the shared base
// image; a real channel with its own image is never affected by it. A
// separate mocked PrismaService again, since these tests need
// findUnique() to answer *differently* depending on which channelName it's
// asked about -- something the two mocks above (always-null,
// always-the-same-row) can't express.
describe('Public images app spacer-channel base-image fallback', () => {
  let app: INestApplication;

  const BASE_IMAGE_ROW = {
    image: new Uint8Array(Buffer.from('base-image-bytes')),
    mimeType: 'image/png',
    contentHash: 'base-image-hash',
  };
  const OWN_IMAGE_ROW = {
    image: new Uint8Array(Buffer.from('own-image-bytes')),
    mimeType: 'image/jpeg',
    contentHash: 'own-image-hash',
  };

  // Mirrors util.ts's SPACER_BASE_IMAGE_CHANNEL_NAME without importing it,
  // so this test would actually notice if that sentinel value ever changed
  // without the controller's fallback lookup being updated to match.
  const SPACER_BASE_IMAGE_CHANNEL_NAME = '__spacer_base_image__';

  function createMockPrismaService(rowsByChannelName: Record<string, unknown>) {
    return {
      channelImage: {
        findUnique: jest.fn(
          ({ where: { channelName } }: { where: { channelName: string } }) =>
            Promise.resolve(rowsByChannelName[channelName] ?? null),
        ),
      },
    };
  }

  async function initAppWithRows(rowsByChannelName: Record<string, unknown>) {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ImagesModulePublic, PrismaModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createMockPrismaService(rowsByChannelName))
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }

  afterEach(async () => {
    await app.close();
  });

  it('serves the base image for a spacer-named channel with no image of its own', async () => {
    await initAppWithRows({
      [SPACER_BASE_IMAGE_CHANNEL_NAME]: BASE_IMAGE_ROW,
    });

    const res = await request(app.getHttpServer() as Server)
      .get('/images/some-spacer-channel')
      .expect(200);

    expect(res.headers['etag']).toBe(`"${BASE_IMAGE_ROW.contentHash}"`);
    expect(res.headers['content-type']).toContain('image/png');
  });

  it("serves a spacer channel's own image instead of the base image, when it has one", async () => {
    await initAppWithRows({
      'my-spacer-channel': OWN_IMAGE_ROW,
      [SPACER_BASE_IMAGE_CHANNEL_NAME]: BASE_IMAGE_ROW,
    });

    const res = await request(app.getHttpServer() as Server)
      .get('/images/my-spacer-channel')
      .expect(200);

    expect(res.headers['etag']).toBe(`"${OWN_IMAGE_ROW.contentHash}"`);
    expect(res.headers['content-type']).toContain('image/jpeg');
  });

  it('still 404s for a spacer-named channel when no base image has been set either', async () => {
    await initAppWithRows({});

    await request(app.getHttpServer() as Server)
      .get('/images/some-spacer-channel')
      .expect(404);
  });

  it('does not fall back to the base image for a non-spacer channel with no image', async () => {
    await initAppWithRows({
      [SPACER_BASE_IMAGE_CHANNEL_NAME]: BASE_IMAGE_ROW,
    });

    await request(app.getHttpServer() as Server)
      .get('/images/lobby')
      .expect(404);
  });

  it('matches "spacer" anywhere in the name, not just as a prefix', async () => {
    await initAppWithRows({
      [SPACER_BASE_IMAGE_CHANNEL_NAME]: BASE_IMAGE_ROW,
    });

    await request(app.getHttpServer() as Server)
      .get('/images/afk-spacer-1')
      .expect(200);
  });
});

// TeamSpeak 6 only renders a channel banner from a URL with a recognized
// image file extension (it doesn't consult Content-Type like a browser
// does), so expectedBannerUrl() (teamspeak-channels.ts) now always appends
// .png. This route must strip that suffix back off before doing the
// channel lookup, so both the new suffixed URL and the old extensionless
// form resolve to the same row.
describe('Public images app .png suffix handling', () => {
  let app: INestApplication;

  const IMAGE_ROW = {
    image: new Uint8Array(Buffer.from('image-bytes')),
    mimeType: 'image/png',
    contentHash: 'image-hash',
  };

  function createMockPrismaService(rowsByChannelName: Record<string, unknown>) {
    return {
      channelImage: {
        findUnique: jest.fn(
          ({ where: { channelName } }: { where: { channelName: string } }) =>
            Promise.resolve(rowsByChannelName[channelName] ?? null),
        ),
      },
    };
  }

  async function initAppWithRows(rowsByChannelName: Record<string, unknown>) {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ImagesModulePublic, PrismaModule],
    })
      .overrideProvider(PrismaService)
      .useValue(createMockPrismaService(rowsByChannelName))
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }

  afterEach(async () => {
    await app.close();
  });

  it('serves the channel image for a .png-suffixed URL', async () => {
    await initAppWithRows({ general: IMAGE_ROW });

    const res = await request(app.getHttpServer() as Server)
      .get('/images/general.png')
      .expect(200);

    expect(res.headers['etag']).toBe(`"${IMAGE_ROW.contentHash}"`);
  });

  it('still serves the channel image for the old extensionless URL', async () => {
    await initAppWithRows({ general: IMAGE_ROW });

    const res = await request(app.getHttpServer() as Server)
      .get('/images/general')
      .expect(200);

    expect(res.headers['etag']).toBe(`"${IMAGE_ROW.contentHash}"`);
  });

  it('strips the suffix case-insensitively', async () => {
    await initAppWithRows({ general: IMAGE_ROW });

    await request(app.getHttpServer() as Server)
      .get('/images/general.PNG')
      .expect(200);
  });

  it('strips only one trailing .png, leaving an embedded .png to be normalized away as usual', async () => {
    // "general.png.png" has its one trailing ".png" stripped, leaving
    // "general.png" -- which normalizeChannelName() then reduces to
    // "generalpng" (dots aren't in its allowed character set), same as any
    // other punctuation embedded in a raw channel name.
    await initAppWithRows({ generalpng: IMAGE_ROW });

    await request(app.getHttpServer() as Server)
      .get('/images/general.png.png')
      .expect(200);
  });
});
