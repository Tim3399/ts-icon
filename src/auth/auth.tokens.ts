/**
 * Dependency-injection tokens for the auth module's providers. Kept in their
 * own file (rather than inline in auth.module.ts) so guards can import just
 * the token without pulling in the module's provider wiring.
 */
export const OIDC_CONFIG = 'OIDC_CONFIG';
export const JWKS_KEY_GETTER = 'JWKS_KEY_GETTER';
