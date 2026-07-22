export const IMG_WEB_PORT = process.env.IMG_WEB_PORT || '3000';
export const IMG_API_PORT = process.env.IMG_API_PORT || '3001';

export const IMG_API_URL = `http://localhost:${IMG_API_PORT}/images-local/`;

export const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// No hardcoded fallback in production: a missing DATABASE_URL in production
// must fail startup loudly rather than silently writing to a throwaway local
// dev database. `file:./dev.db` is still fine as a default for local/dev use.
export const DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';

/**
 * Fails fast if DATABASE_URL is missing in production. Safe to call from any
 * app's bootstrap (both `public` and `local` use the database via Prisma).
 */
export function validateDatabaseConfig(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL must be set explicitly when NODE_ENV=production. Refusing to fall back to the local dev.db default in production.',
    );
  }
}

// LOG_LEVEL controls the minimum severity AppLogger (src/logging/app-logger.ts)
// prints; everything less severe is suppressed. Unlike the credential/OIDC
// config above, an unset or unrecognized value has an obviously safe
// default rather than a security concern, so this fails soft, not fast.
const KNOWN_LOG_LEVELS = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
  'fatal',
] as const;
type ConfigLogLevel = (typeof KNOWN_LOG_LEVELS)[number];

function resolveLogLevel(): ConfigLogLevel {
  const defaultLevel: ConfigLogLevel =
    process.env.NODE_ENV === 'production' ? 'log' : 'debug';
  const configured = process.env.LOG_LEVEL;
  if (!configured) {
    return defaultLevel;
  }
  return (KNOWN_LOG_LEVELS as readonly string[]).includes(configured)
    ? (configured as ConfigLogLevel)
    : defaultLevel;
}

export const LOG_LEVEL: ConfigLogLevel = resolveLogLevel();

export const TS_HOST = process.env.TS_HOST || 'localhost';
export const TS_QUERY_PORT = Number(process.env.TS_QUERY_PORT) || 10011;
export const TS_SERVER_PORT = Number(process.env.TS_SERVER_PORT) || 9987;

// TeamSpeak's classic ServerQuery interface has always supported two
// transports for the identical command set: raw/telnet (the long-standing
// default, still what most TS3-era servers expose) and SSH (the same
// commands, tunneled). Some servers - notably TeamSpeak 6 - only expose the
// SSH transport rather than the raw one, so this needs to be configurable
// per deployment rather than assumed. Defaults to 'raw' since that's what
// every fallback/default port above already assumes.
const KNOWN_TS_PROTOCOLS = ['raw', 'ssh'] as const;
export type TsProtocol = (typeof KNOWN_TS_PROTOCOLS)[number];

function resolveTsProtocol(): TsProtocol {
  const configured = process.env.TS_PROTOCOL;
  return (KNOWN_TS_PROTOCOLS as readonly string[]).includes(configured ?? '')
    ? (configured as TsProtocol)
    : 'raw';
}

export const TS_PROTOCOL: TsProtocol = resolveTsProtocol();

// No fallback defaults here on purpose: 'serveradmin'/'password' were
// well-known TeamSpeak ServerQuery defaults and shipping them as a silent
// fallback effectively hardcodes a known-bad credential. Unset envs must
// fail startup instead.
const TS_USERNAME = process.env.TS_USERNAME;
const TS_USERPASSWORD = process.env.TS_USERPASSWORD;

/**
 * Returns the TeamSpeak ServerQuery credentials, throwing a clear startup
 * error if either is unset. Only the `local` app talks to TeamSpeak (see
 * images.controller.local.ts) so only its bootstrap needs to call this —
 * the `public` app never uses these values and must not be required to set
 * them.
 */
export function getTeamSpeakCredentials(): {
  username: string;
  password: string;
} {
  if (!TS_USERNAME || !TS_USERPASSWORD) {
    throw new Error(
      'TS_USERNAME and TS_USERPASSWORD must be set via environment variables — there is no default credential fallback.',
    );
  }
  return { username: TS_USERNAME, password: TS_USERPASSWORD };
}

// Issuer/audience have no sensible default: accepting tokens from an
// unspecified issuer, or without checking a specific audience, would defeat
// JWT validation entirely, so both are hard-required (see getOidcConfig()).
// The role names, by contrast, are just claim values to compare against —
// 'ts-icon-admin'/'ts-icon-editor' are already the agreed-on names (see
// agents/keycloak.md), so defaulting to them is a convenience, not a
// security-relevant fallback the way TS_USERNAME/TS_USERPASSWORD's removed
// defaults were.
const OIDC_ISSUER_URL = process.env.OIDC_ISSUER_URL;
const OIDC_AUDIENCE = process.env.OIDC_AUDIENCE;
export const OIDC_ADMIN_ROLE = process.env.OIDC_ADMIN_ROLE || 'ts-icon-admin';
export const OIDC_EDITOR_ROLE =
  process.env.OIDC_EDITOR_ROLE || 'ts-icon-editor';

// AUTH_DISABLED lets the `local` app run with no authentication at all -- a
// deliberate escape hatch for running the whole stack as a pure localhost
// overlay without a Keycloak instance at hand (see src/auth/no-auth.guard.ts
// and AuthModule). Unlike OIDC_ISSUER_URL/OIDC_AUDIENCE above, which guard
// against *misconfigured* auth, this guards against auth being turned *off*
// anywhere it could matter -- so it fails fast at startup exactly like
// getOidcConfig()/validateDatabaseConfig()/getTeamSpeakCredentials() above if
// NODE_ENV is production, rather than allowing a silent no-auth prod
// deployment. Reads process.env directly on every call (not a module-level
// const) so it can be safely re-checked from multiple places (AuthModule's
// provider wiring, main.local.ts's bootstrap) the same way getOidcConfig()
// already is.
export function isAuthDisabled(): boolean {
  const disabled = process.env.AUTH_DISABLED === 'true';
  if (disabled && process.env.NODE_ENV === 'production') {
    throw new Error(
      'AUTH_DISABLED=true is not allowed when NODE_ENV=production — refusing to start with authentication disabled in production.',
    );
  }
  return disabled;
}

// The base URL the *public* app is actually reachable at (e.g.
// https://ts-icon.bananenban.de), used to compute the banner URL a
// TeamSpeak channel should be set to point at (see
// src/teamspeak/teamspeak-channels.ts's expectedBannerUrl()). Analogous to
// the frontend's VITE_PUBLIC_API_URL, but a runtime backend value rather
// than a Vite build-time one. Only the `local` app's banner-url endpoints
// need this, so — like OIDC_ISSUER_URL/OIDC_AUDIENCE above — it's a lazily
// re-checked function rather than a top-level constant: config.ts is
// imported by both apps, and a top-level throw here would crash the
// `public` app too, which has no use for this value at all.
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

export function getPublicBaseUrl(): string {
  if (!PUBLIC_BASE_URL) {
    throw new Error(
      'PUBLIC_BASE_URL must be set via environment variables — there is no default base URL for computing managed banner URLs.',
    );
  }
  // Strips any trailing slash so callers can always safely compose
  // `${getPublicBaseUrl()}/images/...` without risking a double slash from
  // an operator-supplied value that happened to include one.
  return PUBLIC_BASE_URL.replace(/\/+$/, '');
}

export interface OidcConfig {
  issuerUrl: string;
  audience: string;
  adminRole: string;
  editorRole: string;
}

/**
 * Returns the OIDC issuer/audience/role configuration, throwing a clear
 * startup error if the issuer or audience is unset. Only the `local` app
 * validates JWTs, so only its bootstrap needs to call this directly — but
 * it's also safe (and cheap) to call again anywhere the values are needed,
 * since it does no I/O of its own.
 */
export function getOidcConfig(): OidcConfig {
  if (!OIDC_ISSUER_URL || !OIDC_AUDIENCE) {
    throw new Error(
      'OIDC_ISSUER_URL and OIDC_AUDIENCE must be set via environment variables — there is no default issuer or audience for JWT validation.',
    );
  }
  return {
    issuerUrl: OIDC_ISSUER_URL,
    audience: OIDC_AUDIENCE,
    adminRole: OIDC_ADMIN_ROLE,
    editorRole: OIDC_EDITOR_ROLE,
  };
}
