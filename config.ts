import ipaddr from "ipaddr.js";

export function parsePort(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const port = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
  return port;
}

export function validateHttpUrl(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL`);
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${name} must be an HTTP(S) URL without credentials, query or fragment`);
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production`);
  }
  return parsed.toString().replace(/\/+$/, "");
}

export const IMG_WEB_PORT = parsePort(process.env.IMG_WEB_PORT, 3000, "IMG_WEB_PORT");
export const IMG_API_PORT = parsePort(process.env.IMG_API_PORT, 3001, "IMG_API_PORT");
export const IMG_API_URL = `http://localhost:${IMG_API_PORT}/images-local/`;
export const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
export const DATABASE_URL = process.env.DATABASE_URL || "file:./dev.db";

export function validateDatabaseConfig(): void {
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set explicitly when NODE_ENV=production");
  }
}

const LOG_LEVELS = ["verbose", "debug", "log", "warn", "error", "fatal"] as const;
type ConfigLogLevel = (typeof LOG_LEVELS)[number];
export const LOG_LEVEL: ConfigLogLevel = LOG_LEVELS.includes(
  process.env.LOG_LEVEL as ConfigLogLevel,
)
  ? (process.env.LOG_LEVEL as ConfigLogLevel)
  : process.env.NODE_ENV === "production"
    ? "log"
    : "debug";

export const TS_HOST = process.env.TS_HOST || "localhost";
export const TS_QUERY_PORT = parsePort(process.env.TS_QUERY_PORT, 10011, "TS_QUERY_PORT");
export const TS_SERVER_PORT = parsePort(process.env.TS_SERVER_PORT, 9987, "TS_SERVER_PORT");
export type TsProtocol = "raw" | "ssh";
export function parseTsProtocol(value: string | undefined): TsProtocol {
  if (value === undefined || value === "") return "raw";
  if (value !== "raw" && value !== "ssh") throw new Error("TS_PROTOCOL must be raw or ssh");
  return value;
}
export const TS_PROTOCOL = parseTsProtocol(process.env.TS_PROTOCOL);

export function getTeamSpeakCredentials(): { username: string; password: string } {
  const username = process.env.TS_USERNAME;
  const password = process.env.TS_USERPASSWORD;
  if (!username || !password) throw new Error("TS_USERNAME and TS_USERPASSWORD must be set");
  return { username, password };
}

export const OIDC_ADMIN_ROLE = process.env.OIDC_ADMIN_ROLE || "ts-icon-admin";
export const OIDC_EDITOR_ROLE = process.env.OIDC_EDITOR_ROLE || "ts-icon-editor";

export function isAuthDisabled(): boolean {
  const disabled = process.env.AUTH_DISABLED === "true";
  if (disabled && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_DISABLED=true is not allowed when NODE_ENV=production");
  }
  return disabled;
}

export function getPublicBaseUrl(): string {
  const value = process.env.PUBLIC_BASE_URL;
  if (!value) throw new Error("PUBLIC_BASE_URL must be set");
  return validateHttpUrl(value, "PUBLIC_BASE_URL");
}

export interface OidcConfig {
  issuerUrl: string;
  audience: string;
  adminRole: string;
  editorRole: string;
}

export function getOidcConfig(): OidcConfig {
  const issuer = process.env.OIDC_ISSUER_URL;
  const audience = process.env.OIDC_AUDIENCE;
  if (!issuer || !audience?.trim())
    throw new Error("OIDC_ISSUER_URL and OIDC_AUDIENCE must be set");
  return {
    issuerUrl: validateHttpUrl(issuer, "OIDC_ISSUER_URL"),
    audience,
    adminRole: OIDC_ADMIN_ROLE,
    editorRole: OIDC_EDITOR_ROLE,
  };
}

/** Only exact addresses/CIDRs are accepted; never trust arbitrary forwarded headers. */
export function getTrustedProxies(): string[] {
  return (process.env.TRUSTED_PROXIES || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        if (value.includes("/")) ipaddr.parseCIDR(value);
        else ipaddr.parse(value);
      } catch {
        throw new Error("TRUSTED_PROXIES must contain only IP addresses or CIDR ranges");
      }
      return value;
    });
}
