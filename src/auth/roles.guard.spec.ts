import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RolesGuard } from './roles.guard';
import type { RequestUser } from './request-user';
import type { OidcConfig } from '../../config';
import type { MetricsService } from '../metrics/metrics.service';

const oidcConfig: OidcConfig = {
  issuerUrl: 'https://auth.example.com/realms/test',
  audience: 'ts3img',
  adminRole: 'ts-icon-admin',
  editorRole: 'ts-icon-editor',
};

function createMetricsService(): MetricsService {
  return {
    authorizationFailuresTotal: { inc: jest.fn() },
  } as unknown as MetricsService;
}

// Hands back the jest.fn() reference directly (rather than reading
// `metrics.authorizationFailuresTotal.inc` back off the object later) to
// sidestep @typescript-eslint/unbound-method, same as this repo's other
// specs that stub a class with method-shaped properties.
function createMetricsStub(): { metrics: MetricsService; inc: jest.Mock } {
  const inc = jest.fn();
  const metrics = {
    authorizationFailuresTotal: { inc },
  } as unknown as MetricsService;
  return { metrics, inc };
}

function createReflectorStub(requiredRoles: string[] | undefined): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
}

function createContext(user: RequestUser | undefined): ExecutionContext {
  const request = { user } as unknown as Request;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows the request through when the route requires no roles', () => {
    const guard = new RolesGuard(
      createReflectorStub(undefined),
      oidcConfig,
      createMetricsService(),
    );
    const context = createContext({ sub: 'u1', roles: [] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a user who has the required role', () => {
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-editor']),
      oidcConfig,
      createMetricsService(),
    );
    const context = createContext({ sub: 'u1', roles: ['ts-icon-editor'] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects with 403 when the user lacks the required role', () => {
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-admin']),
      oidcConfig,
      createMetricsService(),
    );
    const context = createContext({ sub: 'u1', roles: ['ts-icon-editor'] });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects with 403 when the user has no roles at all', () => {
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-editor']),
      oidcConfig,
      createMetricsService(),
    );
    const context = createContext({ sub: 'u1', roles: [] });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('treats a missing req.user as forbidden rather than throwing an unhandled error', () => {
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-editor']),
      oidcConfig,
      createMetricsService(),
    );
    const context = createContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('lets the admin role satisfy an editor-gated route (role hierarchy)', () => {
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-editor']),
      oidcConfig,
      createMetricsService(),
    );
    const context = createContext({ sub: 'u1', roles: ['ts-icon-admin'] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('does not let the editor role satisfy an admin-gated route', () => {
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-admin']),
      oidcConfig,
      createMetricsService(),
    );
    const context = createContext({ sub: 'u1', roles: ['ts-icon-editor'] });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows the request when at least one of several required roles matches', () => {
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-admin', 'ts-icon-editor']),
      oidcConfig,
      createMetricsService(),
    );
    const context = createContext({ sub: 'u1', roles: ['ts-icon-editor'] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('increments the authorization-failure counter when the user lacks the required role', () => {
    const { metrics, inc } = createMetricsStub();
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-admin']),
      oidcConfig,
      metrics,
    );
    const context = createContext({ sub: 'u1', roles: ['ts-icon-editor'] });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(inc).toHaveBeenCalledTimes(1);
  });

  it('does not increment the authorization-failure counter for an allowed request', () => {
    const { metrics, inc } = createMetricsStub();
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-editor']),
      oidcConfig,
      metrics,
    );
    const context = createContext({ sub: 'u1', roles: ['ts-icon-editor'] });

    expect(guard.canActivate(context)).toBe(true);
    expect(inc).not.toHaveBeenCalled();
  });
});
