import type { RequestHandler } from "express";
import type { JWTVerifyGetKey } from "jose";
import type { OidcConfig } from "../../config";
import { isLoopbackAddress } from "../metrics/private-network.guard";
import { extractBearerToken, verifyAccessToken } from "./verify-access-token";

export function swaggerAccess(oidc?: OidcConfig, getKey?: JWTVerifyGetKey): RequestHandler {
  return (request, response, next) => {
    if (!request.path.toLowerCase().startsWith("/swagger")) return next();
    const untrustedForward =
      (request.headers["x-forwarded-for"] || request.headers.forwarded) && !request.ips.length;
    if (
      !untrustedForward &&
      isLoopbackAddress(request.socket.remoteAddress) &&
      isLoopbackAddress(request.ip)
    )
      return next();
    const token = extractBearerToken(request.headers.authorization);
    if (!oidc || !getKey || !token) {
      response.status(401).json({
        statusCode: 401,
        message: "Open the docs on localhost or provide an access token",
      });
      return;
    }
    void verifyAccessToken(token, getKey, oidc).then(
      () => next(),
      () => {
        response.status(401).json({ statusCode: 401, message: "Unauthorized" });
      },
    );
  };
}
