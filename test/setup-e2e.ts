// Runs before any e2e spec file is loaded (wired via jest-e2e.json's
// setupFiles), so these are already set by the time AppModule's providers
// are constructed. AuthModule's OIDC_CONFIG provider calls getOidcConfig()
// during module compilation, which throws if OIDC_ISSUER_URL/OIDC_AUDIENCE
// are unset — real values aren't needed here since these tests never
// exercise actual JWT verification, only routes that are exempt from it.
process.env.OIDC_ISSUER_URL ||= 'https://example.test/realms/test';
process.env.OIDC_AUDIENCE ||= 'test-audience';
