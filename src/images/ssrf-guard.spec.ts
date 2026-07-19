import {
  isBlockedIp,
  assertSafeUrlShape,
  SsrfValidationError,
} from './ssrf-guard';

describe('isBlockedIp', () => {
  it('blocks IPv4 loopback', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
  });

  it('blocks IPv4 private ranges', () => {
    expect(isBlockedIp('10.0.0.5')).toBe(true);
    expect(isBlockedIp('172.16.0.5')).toBe(true);
    expect(isBlockedIp('192.168.1.5')).toBe(true);
  });

  it('blocks IPv4 link-local, including the AWS/GCP/Azure metadata address', () => {
    expect(isBlockedIp('169.254.169.254')).toBe(true);
    expect(isBlockedIp('169.254.1.1')).toBe(true);
  });

  it('blocks IPv4 multicast, broadcast, and CGNAT', () => {
    expect(isBlockedIp('224.0.0.1')).toBe(true);
    expect(isBlockedIp('255.255.255.255')).toBe(true);
    expect(isBlockedIp('100.64.0.1')).toBe(true);
  });

  it('blocks IPv6 loopback and unique-local, including the AWS metadata address', () => {
    expect(isBlockedIp('::1')).toBe(true);
    expect(isBlockedIp('fd00:ec2::254')).toBe(true);
    expect(isBlockedIp('fc00::1')).toBe(true);
  });

  it('blocks IPv6 link-local and multicast', () => {
    expect(isBlockedIp('fe80::1')).toBe(true);
    expect(isBlockedIp('ff02::1')).toBe(true);
  });

  it('blocks IPv6 forms that tunnel/embed an IPv4 address', () => {
    expect(isBlockedIp('::ffff:10.0.0.1')).toBe(true); // IPv4-mapped, embeds a private address
    expect(isBlockedIp('2002::1')).toBe(true); // 6to4
    expect(isBlockedIp('2001:0::1')).toBe(true); // Teredo
  });

  it('rejects garbage input rather than assuming it is safe', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true);
    expect(isBlockedIp('')).toBe(true);
  });

  it('allows public IPv4 and IPv6 unicast addresses', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('1.1.1.1')).toBe(false);
    expect(isBlockedIp('2606:4700:4700::1111')).toBe(false);
  });
});

describe('assertSafeUrlShape', () => {
  it('accepts a plain https URL with no explicit port', () => {
    expect(() =>
      assertSafeUrlShape('https://example.com/image.png'),
    ).not.toThrow();
  });

  it('accepts an explicit default HTTPS port', () => {
    expect(() =>
      assertSafeUrlShape('https://example.com:443/image.png'),
    ).not.toThrow();
  });

  it('rejects non-https schemes', () => {
    expect(() => assertSafeUrlShape('http://example.com/image.png')).toThrow(
      SsrfValidationError,
    );
    expect(() => assertSafeUrlShape('file:///etc/passwd')).toThrow(
      SsrfValidationError,
    );
    expect(() => assertSafeUrlShape('ftp://example.com/image.png')).toThrow(
      SsrfValidationError,
    );
  });

  it('rejects URLs with embedded credentials', () => {
    expect(() =>
      assertSafeUrlShape('https://user:pass@example.com/image.png'),
    ).toThrow(SsrfValidationError);
  });

  it('rejects non-default ports', () => {
    expect(() =>
      assertSafeUrlShape('https://example.com:8443/image.png'),
    ).toThrow(SsrfValidationError);
  });

  it('rejects malformed URLs', () => {
    expect(() => assertSafeUrlShape('not a url')).toThrow(SsrfValidationError);
  });
});
