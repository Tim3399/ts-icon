export const IMG_WEB_PORT = process.env.IMG_WEB_PORT || '3000';
export const IMG_API_PORT = process.env.IMG_API_PORT || '3001';

export const IMG_API_URL = `http://localhost:${IMG_API_PORT}/images-local/`;

export const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
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
export function getTeamSpeakCredentials(): { username: string; password: string } {
  if (!TS_USERNAME || !TS_USERPASSWORD) {
    throw new Error(
      'TS_USERNAME and TS_USERPASSWORD must be set via environment variables — there is no default credential fallback.',
    );
  }
  return { username: TS_USERNAME, password: TS_USERPASSWORD };
}
