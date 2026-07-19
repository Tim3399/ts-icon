import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { RolesGuard } from './roles.guard';
import type { RequestUser } from './request-user';
import type { OidcConfig } from '../../config';

const oidcConfig: OidcConfig = {
  issuerUrl: 'https://auth.example.com/realms/test',
  audience: 'ts3img',
  adminRole: 'ts-icon-admin',
  editorRole: 'ts-icon-editor',
};

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
    const guard = new RolesGuard(createReflectorStub(undefined), oidcConfig);
    const context = createContext({ sub: 'u1', roles: [] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a user who has the required role', () => {
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-editor']),
      oidcConfig,
    );
    const context = createContext({ sub: 'u1', roles: ['ts-icon-editor'] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects with 403 when the user lacks the required role', () => {
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-admin']),
      oidcConfig,
    );
    const context = createContext({ sub: 'u1', roles: ['ts-icon-editor'] });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects with 403 when the user has no roles at all', () => {
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-editor']),
      oidcConfig,
    );
    const context = createContext({ sub: 'u1', roles: [] });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('treats a missing req.user as forbidden rather than throwing an unhandled error', () => {
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-editor']),
      oidcConfig,
    );
    const context = createContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('lets the admin role satisfy an editor-gated route (role hierarchy)', () => {
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-editor']),
      oidcConfig,
    );
    const context = createContext({ sub: 'u1', roles: ['ts-icon-admin'] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('does not let the editor role satisfy an admin-gated route', () => {
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-admin']),
      oidcConfig,
    );
    const context = createContext({ sub: 'u1', roles: ['ts-icon-editor'] });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows the request when at least one of several required roles matches', () => {
    const guard = new RolesGuard(
      createReflectorStub(['ts-icon-admin', 'ts-icon-editor']),
      oidcConfig,
    );
    const context = createContext({ sub: 'u1', roles: ['ts-icon-editor'] });

    expect(guard.canActivate(context)).toBe(true);
  });
});
