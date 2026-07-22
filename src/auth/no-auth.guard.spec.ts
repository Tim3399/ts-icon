import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { NoAuthGuard } from './no-auth.guard';

function createContext(ip: string | undefined): {
  context: ExecutionContext;
  request: Request;
} {
  const request = { ip } as unknown as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('NoAuthGuard', () => {
  it('allows a request from loopback and attaches a synthetic user', () => {
    const { context, request } = createContext('127.0.0.1');

    expect(new NoAuthGuard().canActivate(context)).toBe(true);
    expect(request.user).toEqual({ sub: 'auth-disabled', roles: [] });
  });

  it('allows a request from a private-range address', () => {
    const { context } = createContext('192.168.1.50');

    expect(new NoAuthGuard().canActivate(context)).toBe(true);
  });

  it('rejects a request from a public address with a 403', () => {
    const { context } = createContext('8.8.8.8');

    expect(() => new NoAuthGuard().canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a request with no discernible IP at all', () => {
    const { context } = createContext(undefined);

    expect(() => new NoAuthGuard().canActivate(context)).toThrow(
      ForbiddenException,
    );
  });

  it('does not attach a user when rejecting a non-private-address request', () => {
    const { context, request } = createContext('8.8.8.8');

    expect(() => new NoAuthGuard().canActivate(context)).toThrow(
      ForbiddenException,
    );
    expect(request.user).toBeUndefined();
  });
});
