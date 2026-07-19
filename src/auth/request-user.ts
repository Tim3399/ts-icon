import type { JWTPayload } from 'jose';

/**
 * The shape attached to `req.user` once JwtAuthGuard has verified a token.
 * Deliberately minimal — just enough for RolesGuard and any downstream code
 * to identify who made the request and what they're allowed to do.
 */
export interface RequestUser {
  sub: string;
  roles: string[];
}

interface KeycloakResourceAccessClaim {
  [clientId: string]: { roles?: unknown } | undefined;
}

/**
 * Reads Keycloak client roles out of a validated token payload.
 *
 * Keycloak places *client* roles (as opposed to realm-wide roles) at
 * `resource_access[<clientId>].roles`, one bucket per client the token was
 * issued for. The frontend (`webapp-banner-tool/src/auth/AuthProvider.tsx`)
 * reads its own roles from exactly this same path using its Keycloak client
 * id — the backend uses `OIDC_AUDIENCE` as the client id to look up here so
 * both sides agree on where roles live in the token (the audience *is* the
 * client id in this setup, see agents/keycloak.md's single-client decision).
 */
export function extractRoles(payload: JWTPayload, clientId: string): string[] {
  const resourceAccess = payload.resource_access as
    | KeycloakResourceAccessClaim
    | undefined;
  const roles = resourceAccess?.[clientId]?.roles;
  return Array.isArray(roles)
    ? roles.filter((r): r is string => typeof r === 'string')
    : [];
}

/**
 * Builds the `req.user` object from a validated JWT payload. `sub` is
 * required by the JWT spec's registered claims but jose types it as
 * optional (a token could theoretically omit it) — fall back to an empty
 * string rather than throwing, since a missing subject doesn't invalidate
 * the signature/issuer/audience checks that already passed.
 */
export function toRequestUser(
  payload: JWTPayload,
  clientId: string,
): RequestUser {
  return {
    sub: payload.sub ?? '',
    roles: extractRoles(payload, clientId),
  };
}
