import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import sharp from 'sharp';
import { ImagesModuleLocal } from './images.module.local';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

const TEST_PUBLIC_BASE_URL = 'https://ts-icon.example.test';

// getPublicBaseUrl() is read once, at construction time, by
// ImagesLocalController's publicBaseUrl field -- see the equivalent mock in
// images.controller.local.spec.ts for why this can't just be a
// process.env assignment in this file.
jest.mock('../../config', () => {
  const actual =
    jest.requireActual<typeof import('../../config')>('../../config');
  return {
    ...actual,
    getPublicBaseUrl: jest.fn(() => TEST_PUBLIC_BASE_URL),
  };
});

/**
 * Real HTTP-level (supertest) tests, not direct controller-method calls
 * like the rest of images.controller.local.spec.ts -- deliberately so:
 * this suite exists specifically to catch a route-*ordering* bug (a
 * literal `POST /images-local/spacer-base-image` being swallowed by the
 * earlier-registered `POST /images-local/:channelName` wildcard route,
 * since both are single-segment paths for the same method), which calling
 * controller methods directly can never exercise -- that bypasses Nest's
 * router entirely. ImagesModuleLocal has no auth guard wired into it on
 * its own (that only happens at the full AppModule level via AuthModule),
 * so no bearer token is needed here, matching
 * images.controller.public.spec.ts's existing pattern for module-level
 * e2e-style tests.
 */
describe('ImagesLocalController spacer-base-image routes (e2e)', () => {
  let app: INestApplication;
  let storedRow: {
    image: Uint8Array;
    mimeType: string;
    contentHash: string;
    size: number;
  } | null;
  let testPngBytes: Buffer;

  beforeAll(async () => {
    testPngBytes = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 200, g: 50, b: 50 },
      },
    })
      .png()
      .toBuffer();
  });

  const mockPrismaService = {
    channelImage: {
      findUnique: jest.fn(() => Promise.resolve(storedRow)),
      upsert: jest.fn(
        (args: {
          create: {
            image: Uint8Array;
            mimeType: string;
            contentHash: string;
            size: number;
          };
        }) => {
          storedRow = { ...args.create };
          return Promise.resolve(storedRow);
        },
      ),
    },
  };

  beforeEach(async () => {
    storedRow = null;
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ImagesModuleLocal, PrismaModule],
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

  it('routes POST to uploadSpacerBaseImage, not the per-channel upload wildcard', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/images-local/spacer-base-image')
      .attach('file', testPngBytes, 'base.png');

    // uploadImage's success message is "Image saved successfully" (a
    // different string) -- getting *this* exact message back is what
    // proves uploadSpacerBaseImage actually ran, not the wildcard handler
    // silently accepting "spacer-base-image" as a channel name instead.
    expect(res.body).toEqual({ message: 'Spacer base image set successfully' });
  });

  it('GET returns 404 before any base image has been set', async () => {
    await request(app.getHttpServer() as Server)
      .get('/images-local/spacer-base-image')
      .expect(404);
  });

  it('GET returns the uploaded image after POST has set it', async () => {
    await request(app.getHttpServer() as Server)
      .post('/images-local/spacer-base-image')
      .attach('file', testPngBytes, 'base.png')
      .expect(201);

    const res = await request(app.getHttpServer() as Server)
      .get('/images-local/spacer-base-image')
      .expect(200);

    expect(res.headers['content-type']).toContain('image/png');
  });
});
