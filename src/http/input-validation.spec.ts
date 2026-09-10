import { Body, Controller, HttpException, Post, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Type } from "class-transformer";
import { IsInt, IsString, Min, ValidateNested } from "class-validator";
import type { Server } from "node:http";
import request from "supertest";
import { ApiExceptionFilter } from "./api-exception.filter";
import { inputValidation } from "./input-validation";

class Options {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  count!: number;
}
class Input {
  @IsString()
  name!: string;

  @Type(() => Options)
  @ValidateNested()
  options!: Options;
}
@Controller()
class ValidationProbe {
  @Post("input") input(@Body() input: Input) {
    return input;
  }
  @Post("upstream") upstream() {
    throw new HttpException(
      { message: "Unavailable", fieldErrors: { password: ["private"] } },
      503,
    );
  }
}

describe("input validation over HTTP", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ValidationProbe] }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(inputValidation());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });
  afterAll(async () => app.close());

  it("returns nested field paths without input values or DTO targets", async () => {
    const response = await request(app.getHttpServer() as Server)
      .post("/input")
      .send({ name: { credential: "private-value" }, options: { count: "0" } })
      .expect(400);
    expect(response.body).toMatchObject({
      code: "INVALID_INPUT",
      fieldErrors: {
        name: ["name must be a string"],
        "options.count": ["count must not be less than 1"],
      },
    });
    expect(response.text).not.toContain("private-value");
    expect(response.text).not.toContain("credential");
  });

  it("keeps transformation and rejects extra fields without echoing their values", async () => {
    await request(app.getHttpServer() as Server)
      .post("/input")
      .send({ name: "Banner", options: { count: "2" } })
      .expect(201, { name: "Banner", options: { count: 2 } });
    const response = await request(app.getHttpServer() as Server)
      .post("/input")
      .send({ name: "Banner", options: { count: 2 }, extra: "private-extra" })
      .expect(400);
    expect(response.body).toMatchObject({
      fieldErrors: { extra: ["property extra should not exist"] },
    });
    expect(response.text).not.toContain("private-extra");
  });

  it("does not forward untrusted field payloads from upstream exceptions", async () => {
    const response = await request(app.getHttpServer() as Server)
      .post("/upstream")
      .expect(503);
    expect(response.body).not.toHaveProperty("fieldErrors");
    expect(response.text).not.toContain("private");
  });
});
