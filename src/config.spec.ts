import {
  isAuthDisabled,
  parsePort,
  parseTsProtocol,
  validateHttpUrl,
  getTrustedProxies,
} from "../config";

describe("validated deployment configuration", () => {
  it.each(["-1", "0", "65536", "3.5", "abc"])("rejects invalid port %s", (value) => {
    expect(() => parsePort(value, 3000, "PORT")).toThrow("PORT");
  });
  it("does not silently downgrade an unknown query transport", () => {
    expect(() => parseTsProtocol("sshh")).toThrow("TS_PROTOCOL");
    expect(parseTsProtocol("ssh")).toBe("ssh");
  });
  it.each([
    "ftp://example.test",
    "https://user:secret@example.test",
    "https://example.test/?secret=x",
  ])("rejects unsafe configured URLs", (url) => {
    expect(() => validateHttpUrl(url, "TEST_URL")).toThrow("TEST_URL");
  });
  it("only accepts explicit proxy IPs and subnets", () => {
    const before = process.env.TRUSTED_PROXIES;
    try {
      process.env.TRUSTED_PROXIES = "127.0.0.1, 10.10.0.0/24";
      expect(getTrustedProxies()).toEqual(["127.0.0.1", "10.10.0.0/24"]);
      process.env.TRUSTED_PROXIES = "true";
      expect(() => getTrustedProxies()).toThrow("TRUSTED_PROXIES");
    } finally {
      if (before === undefined) delete process.env.TRUSTED_PROXIES;
      else process.env.TRUSTED_PROXIES = before;
    }
  });
});

describe("isAuthDisabled", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns false when AUTH_DISABLED is unset", () => {
    delete process.env.AUTH_DISABLED;
    expect(isAuthDisabled()).toBe(false);
  });

  it('returns false for any value other than the literal string "true"', () => {
    process.env.AUTH_DISABLED = "1";
    expect(isAuthDisabled()).toBe(false);
  });

  it("returns true when AUTH_DISABLED=true and NODE_ENV is not production", () => {
    process.env.AUTH_DISABLED = "true";
    process.env.NODE_ENV = "development";
    expect(isAuthDisabled()).toBe(true);
  });

  it("throws when AUTH_DISABLED=true and NODE_ENV=production", () => {
    process.env.AUTH_DISABLED = "true";
    process.env.NODE_ENV = "production";
    expect(() => isAuthDisabled()).toThrow(/NODE_ENV=production/);
  });

  it("does not throw when NODE_ENV=production if AUTH_DISABLED is not set", () => {
    delete process.env.AUTH_DISABLED;
    process.env.NODE_ENV = "production";
    expect(isAuthDisabled()).toBe(false);
  });
});
