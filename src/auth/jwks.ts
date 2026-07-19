import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

/**
 * Builds a JWKS key resolver for verifying tokens issued by the given
 * issuer, backed by `jose`'s `createRemoteJWKSet` — it fetches the signing
 * keys lazily (on first verification, not at startup) and caches/rotates
 * them internally, so this app never needs to hand-roll JWKS fetching,
 * caching, or key rollover itself.
 *
 * Endpoint choice: this hits Keycloak's conventional
 * `{issuer}/protocol/openid-connect/certs` endpoint directly rather than
 * first fetching `{issuer}/.well-known/openid-configuration` and reading its
 * `jwks_uri`. `jose` has no built-in OIDC discovery helper, so going through
 * discovery would mean hand-rolling an extra fetch-and-parse step ourselves
 * anyway — for no real robustness gain here, since `OIDC_ISSUER_URL` is
 * already pinned to a specific realm base URL (`/realms/{realm}`, the
 * current Keycloak URL convention — the `certs` path under it has been
 * stable across Keycloak versions using that base, unlike the older
 * `/auth/realms/...` prefix some very old versions used). Going direct also
 * avoids adding a second startup-time network round trip to a discovery
 * document whose only useful field, for us, is the same certs URL we can
 * already construct.
 */
export function createJwksKeyGetter(issuerUrl: string): JWTVerifyGetKey {
  const jwksUrl = new URL(
    `${issuerUrl.replace(/\/+$/, '')}/protocol/openid-connect/certs`,
  );
  return createRemoteJWKSet(jwksUrl);
}
