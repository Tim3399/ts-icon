type BuildEnvironment = Record<string, string | undefined>;

function validateHttpUrl(value: string, name: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) URL.`);
  }
  if (
    !["https:", "http:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    value.includes("\\")
  ) {
    throw new Error(`${name} must be an HTTP(S) URL without credentials.`);
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !loopback)
    throw new Error(`${name} requires HTTPS outside localhost.`);
  if (value.includes("your-") || value.includes("<"))
    throw new Error(`${name} still contains an example placeholder.`);
}

export function validateBuildEnvironment(environment: BuildEnvironment): void {
  for (const key of ["VITE_PUBLIC_API_URL", "VITE_ADMIN_API_URL"]) {
    const value = environment[key];
    if (value === undefined)
      throw new Error(`${key} must be configured explicitly before building.`);
    if (key === "VITE_PUBLIC_API_URL" && value === "") continue; // same origin
    if (!value) throw new Error(`${key} must not be empty.`);
    if (/[?#\\]/.test(value))
      throw new Error(`${key} must not contain a query, fragment or backslash.`);
    if (value.startsWith("/") && !value.startsWith("//")) continue;
    validateHttpUrl(value, key);
  }
  const keycloak = environment.VITE_KEYCLOAK_URL;
  if (!keycloak) throw new Error("VITE_KEYCLOAK_URL must be configured before building.");
  validateHttpUrl(keycloak, "VITE_KEYCLOAK_URL");
  for (const key of ["VITE_KEYCLOAK_REALM", "VITE_KEYCLOAK_CLIENT_ID"]) {
    const value = environment[key];
    if (!value?.trim() || /[<>\s]/.test(value) || value.includes("your-")) {
      throw new Error(`${key} must contain the actual Keycloak setting.`);
    }
  }
  if (
    environment.VITE_KEYCLOAK_ENABLED &&
    !["true", "false"].includes(environment.VITE_KEYCLOAK_ENABLED)
  ) {
    throw new Error("VITE_KEYCLOAK_ENABLED must be true or false.");
  }
}
