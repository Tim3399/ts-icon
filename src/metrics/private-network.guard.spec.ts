import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import {
  PrivateNetworkGuard,
  isPrivateOrLoopbackAddress,
} from './private-network.guard';

function createContext(ip: string | undefined): ExecutionContext {
  const request = { ip } as unknown as Request;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('isPrivateOrLoopbackAddress', () => {
  it('allows IPv4 loopback', () => {
    expect(isPrivateOrLoopbackAddress('127.0.0.1')).toBe(true);
  });

  it('allows IPv4 private ranges', () => {
    expect(isPrivateOrLoopbackAddress('10.0.0.5')).toBe(true);
    expect(isPrivateOrLoopbackAddress('172.16.0.5')).toBe(true);
    expect(isPrivateOrLoopbackAddress('192.168.1.5')).toBe(true);
  });

  it('allows IPv6 loopback and unique-local', () => {
    expect(isPrivateOrLoopbackAddress('::1')).toBe(true);
    expect(isPrivateOrLoopbackAddress('fc00::1')).toBe(true);
    expect(isPrivateOrLoopbackAddress('fd12:3456:789a::1')).toBe(true);
  });

  it('allows link-local addresses', () => {
    expect(isPrivateOrLoopbackAddress('169.254.1.1')).toBe(true);
    expect(isPrivateOrLoopbackAddress('fe80::1')).toBe(true);
  });

  it('unwraps an IPv4-mapped IPv6 loopback address (dual-stack listener) as loopback', () => {
    // Node reports an IPv4 peer's address this way on a dual-stack listener
    // (`::` / unspecified) -- must be recognized as loopback, not rejected
    // just because of the wrapping form.
    expect(isPrivateOrLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('unwraps an IPv4-mapped IPv6 private-range address as private', () => {
    expect(isPrivateOrLoopbackAddress('::ffff:10.0.0.5')).toBe(true);
  });

  it('rejects public IPv4 and IPv6 addresses', () => {
    expect(isPrivateOrLoopbackAddress('8.8.8.8')).toBe(false);
    expect(isPrivateOrLoopbackAddress('1.1.1.1')).toBe(false);
    expect(isPrivateOrLoopbackAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('rejects a public address even when wrapped as IPv4-mapped IPv6', () => {
    expect(isPrivateOrLoopbackAddress('::ffff:8.8.8.8')).toBe(false);
  });

  it('rejects garbage input rather than assuming it is safe', () => {
    expect(isPrivateOrLoopbackAddress('not-an-ip')).toBe(false);
    expect(isPrivateOrLoopbackAddress('')).toBe(false);
  });
});

describe('PrivateNetworkGuard', () => {
  it('allows a request from loopback', () => {
    const guard = new PrivateNetworkGuard();
    const context = createContext('127.0.0.1');

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a request from a private-range address', () => {
    const guard = new PrivateNetworkGuard();
    const context = createContext('192.168.1.50');

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a request from a public address with a 403', () => {
    const guard = new PrivateNetworkGuard();
    const context = createContext('8.8.8.8');

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects a request with no discernible IP at all', () => {
    const guard = new PrivateNetworkGuard();
    const context = createContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
