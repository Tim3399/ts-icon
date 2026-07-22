import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { AppModule } from './../src/app.module.local';

describe('Admin app (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // Liveness is marked @Public(), so this also verifies that the app's
  // global JWT guard (applied to every other route in this module) doesn't
  // end up blocking a route that's explicitly exempted from it.
  it('GET /health/live succeeds without a token', () => {
    return request(app.getHttpServer() as Server)
      .get('/health/live')
      .expect(200)
      .expect({ status: 'ok' });
  });

  // Every other route requires a Bearer token; this confirms the global
  // guard actually applies by default rather than only to routes that
  // explicitly opt in.
  it('GET /images-local/options rejects a request with no token', () => {
    return request(app.getHttpServer() as Server)
      .get('/images-local/options')
      .expect(401);
  });
});
