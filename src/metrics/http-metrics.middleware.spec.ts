import {
  Controller,
  Get,
  HttpException,
  Module,
  UseGuards,
  type CanActivate,
  type INestApplication,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import type { Server } from "node:http";
import { MetricsModule } from "./metrics.module";
import { MetricsService } from "./metrics.service";
import { configureHttp } from "../http/configure-http";

function rejectingGuard(status: number): CanActivate {
  return {
    canActivate(): boolean {
      throw new HttpException("Rejected", status);
    },
  };
}
@Controller()
class ProbeController {
  @Get("ok") ok() {
    return { ok: true };
  }
  @Get("bad") bad() {
    throw new HttpException("Invalid input", 400);
  }
  @Get("unauthorized") @UseGuards(rejectingGuard(401)) unauthorized() {
    return {};
  }
  @Get("forbidden") @UseGuards(rejectingGuard(403)) forbidden() {
    return {};
  }
  @Get("limited") @UseGuards(rejectingGuard(429)) limited() {
    return {};
  }
  @Get("broken") broken() {
    throw new Error("private connection credentials");
  }
}
@Module({ imports: [MetricsModule], controllers: [ProbeController] })
class ProbeModule {}

describe("HTTP observation before guards", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = module.createNestApplication({ logger: false, bodyParser: false });
    configureHttp(app, { origin: "https://ui.example.test", exposedHeaders: ["X-Request-Id"] });
    await app.init();
  });

  it("observes malformed and oversized JSON before controller routing", async () => {
    for (const [body, status] of [
      ["{secret-password", 400],
      [JSON.stringify({ data: "x".repeat(110_000) }), 413],
    ] as const) {
      const response = await request(app.getHttpServer() as Server)
        .post("/ok")
        .set("Content-Type", "application/json")
        .set("Origin", "https://ui.example.test")
        .send(body);
      expect(response.status).toBe(status);
      expect(response.headers["x-request-id"]).toBeDefined();
      expect(response.headers["access-control-allow-origin"]).toBe("https://ui.example.test");
      expect(response.headers["access-control-expose-headers"]).toContain("X-Request-Id");
      expect(response.text).not.toContain("secret-password");
    }
    const values = (await app.get(MetricsService).httpRequestsTotal.get()).values;
    expect(
      values.filter((value) => value.labels.method === "POST").map((value) => value.value),
    ).toEqual([1, 1]);
  });
  afterAll(async () => {
    await app.close();
  });

  it("counts controller errors, guard errors and unmatched routes once", async () => {
    const cases: Array<[string, number]> = [
      ["ok", 200],
      ["bad", 400],
      ["unauthorized", 401],
      ["forbidden", 403],
      ["missing", 404],
      ["limited", 429],
      ["broken", 500],
    ];
    for (const [path, status] of cases) {
      const response = await request(app.getHttpServer() as Server)
        .get(`/${path}`)
        .set("X-Request-Id", "probe-id");
      expect(response.status).toBe(status);
      expect(response.headers["x-request-id"]).toBe("probe-id");
      if (status === 500) {
        expect(response.text).not.toContain("private connection credentials");
        expect(response.body).toMatchObject({ code: "INTERNAL_ERROR", requestId: "probe-id" });
      }
    }
    const values = (await app.get(MetricsService).httpRequestsTotal.get()).values.filter(
      (value) => value.labels.method === "GET",
    );
    expect(values).toHaveLength(cases.length);
    for (const [, status] of cases) {
      expect(values.filter((value) => value.labels.status === String(status))).toEqual([
        expect.objectContaining({ value: 1 }),
      ]);
    }
    expect(values.find((value) => value.labels.status === "404")?.labels.route).toBe("unmatched");
  });
});
