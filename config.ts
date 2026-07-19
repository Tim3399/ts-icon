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
