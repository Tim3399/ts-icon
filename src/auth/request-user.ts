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

interface KeycloakRealmAccessClaim {
  roles?: unknown;
}

/**
 * Reads Keycloak realm roles out of a validated token payload.
 *
 * Keycloak places *realm* roles (as opposed to per-client roles) at
 * `realm_access.roles` — a single, realm-wide bucket rather than one keyed
 * by client id. The frontend (`webapp-banner-tool/src/auth/AuthProvider.tsx`)
 * reads its own roles from this same path.
 */
export function extractRoles(payload: JWTPayload): string[] {
  const realmAccess = payload.realm_access as
    | KeycloakRealmAccessClaim
    | undefined;
  const roles = realmAccess?.roles;
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
export function toRequestUser(payload: JWTPayload): RequestUser {
  return {
    sub: payload.sub ?? '',
    roles: extractRoles(payload),
  };
}
