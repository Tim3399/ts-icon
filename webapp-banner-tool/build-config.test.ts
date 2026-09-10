import { describe, expect, it } from "vitest";
import { validateBuildEnvironment } from "./build-config";

const valid = {
  VITE_PUBLIC_API_URL: "",
  VITE_ADMIN_API_URL: "/admin-api",
  VITE_KEYCLOAK_URL: "https://login.example.test",
  VITE_KEYCLOAK_REALM: "ts-icon",
  VITE_KEYCLOAK_CLIENT_ID: "webapp-banner-tool",
};

describe("production build configuration", () => {
  it("accepts explicit same-origin APIs and actual Keycloak settings", () => {
    expect(() => validateBuildEnvironment(valid)).not.toThrow();
  });
  it("rejects missing API config rather than shipping localhost fallbacks", () => {
    expect(() => validateBuildEnvironment({ ...valid, VITE_ADMIN_API_URL: undefined })).toThrow(
      "VITE_ADMIN_API_URL",
    );
  });
  it("rejects placeholders and insecure remote URLs", () => {
    expect(() =>
      validateBuildEnvironment({ ...valid, VITE_KEYCLOAK_URL: "https://your-keycloak-host" }),
    ).toThrow("placeholder");
    expect(() =>
      validateBuildEnvironment({ ...valid, VITE_PUBLIC_API_URL: "http://public.example.test" }),
    ).toThrow("HTTPS");
  });
  it("rejects API and Keycloak bases whose query/fragment would swallow appended paths", () => {
    for (const value of [
      "/admin-api?x=y",
      "/admin-api#fragment",
      "https://api.example.test?token=x",
      "https://api.example.test#fragment",
      "/admin\\api",
    ]) {
      expect(() => validateBuildEnvironment({ ...valid, VITE_ADMIN_API_URL: value })).toThrow();
    }
    expect(() =>
      validateBuildEnvironment({
        ...valid,
        VITE_KEYCLOAK_URL: "https://login.example.test#fragment",
      }),
    ).toThrow();
  });
});
