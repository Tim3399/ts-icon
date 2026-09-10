import { jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import type { OidcConfig } from "../../config";

export function extractBearerToken(header: string | undefined): string | undefined {
  return header?.match(/^Bearer\s+(\S+)$/i)?.[1];
}

/** Keycloak access-token policy shared by the API and authenticated docs access. */
export async function verifyAccessToken(
  token: string,
  getKey: JWTVerifyGetKey,
  config: OidcConfig,
): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, getKey, {
    issuer: config.issuerUrl,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "exp", "iat", "azp"],
  });
  if (payload.azp !== config.audience) {
    throw new Error("Token authorized party does not match the configured client");
  }
  if (payload.typ !== "Bearer" || typeof payload.sub !== "string" || !payload.sub.trim()) {
    throw new Error("An access token is required");
  }
  return payload;
}
