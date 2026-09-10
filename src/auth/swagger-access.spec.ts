import type { Request, Response } from "express";
import { swaggerAccess } from "./swagger-access";

function request(path: string, ip = "127.0.0.1", headers = {}, ips: string[] = []): Request {
  return { path, ip, headers, ips, socket: { remoteAddress: "127.0.0.1" } } as unknown as Request;
}

describe("development Swagger access", () => {
  it.each(["/swagger", "/swagger-json", "/swagger/swagger-ui-init.js"])(
    "allows direct local loading of %s",
    (path) => {
      const next = jest.fn();
      swaggerAccess()(request(path), {} as Response, next);
      expect(next).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    request("/swagger-json", "8.8.8.8"),
    request("/swagger/swagger-ui-init.js", "127.0.0.1", { "x-forwarded-for": "8.8.8.8" }),
    request("/swagger", "8.8.8.8", { "x-forwarded-for": "8.8.8.8" }, ["8.8.8.8"]),
    request("/SWAGGER-json", "127.0.0.1", { "x-forwarded-for": "8.8.8.8" }),
    request("/Swagger", "127.0.0.1", { "x-forwarded-for": "8.8.8.8" }),
    request("/Swagger/swagger-ui-init.js", "127.0.0.1", { "x-forwarded-for": "8.8.8.8" }),
  ])("does not treat forwarded public clients as direct loopback", (req) => {
    const status = jest.fn().mockReturnThis();
    const json = jest.fn();
    const next = jest.fn();
    swaggerAccess()(req, { status, json } as unknown as Response, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
