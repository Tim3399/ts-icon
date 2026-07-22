// Runs before any e2e spec file is loaded (wired via jest-e2e.json's
// setupFiles), so these are already set by the time AppModule's providers
// are constructed. AuthModule's OIDC_CONFIG provider calls getOidcConfig()
// during module compilation, which throws if OIDC_ISSUER_URL/OIDC_AUDIENCE
// are unset — real values aren't needed here since these tests never
// exercise actual JWT verification, only routes that are exempt from it.
process.env.OIDC_ISSUER_URL ||= 'https://example.test/realms/test';
process.env.OIDC_AUDIENCE ||= 'test-audience';

// ImagesLocalController reads getPublicBaseUrl() at construction time (see
// its publicBaseUrl field), which throws if PUBLIC_BASE_URL is unset — real
// value not needed here since these tests never exercise the banner-URL
// endpoints, only routes exempt from auth entirely.
process.env.PUBLIC_BASE_URL ||= 'https://ts-icon.example.test';
