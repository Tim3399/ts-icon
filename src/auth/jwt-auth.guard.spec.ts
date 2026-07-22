import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type KeyLike,
  type JWTVerifyGetKey,
} from 'jose';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { OidcConfig } from '../../config';
import type { MetricsService } from '../metrics/metrics.service';

function createMetricsService(): MetricsService {
  return {
    authFailuresTotal: { inc: jest.fn() },
  } as unknown as MetricsService;
}

// Hands back the jest.fn() reference directly (rather than reading
// `metrics.authFailuresTotal.inc` back off the object later) to sidestep
// @typescript-eslint/unbound-method, same as this repo's other specs that
// stub a class with method-shaped properties.
function createMetricsStub(): { metrics: MetricsService; inc: jest.Mock } {
  const inc = jest.fn();
  const metrics = { authFailuresTotal: { inc } } as unknown as MetricsService;
  return { metrics, inc };
}

const ISSUER = 'https://auth.example.com/realms/test';
const AUDIENCE = 'ts3img';

function createReflectorStub(isPublic: boolean): Reflector {
  return {
    getAllAndOverride: jest.fn().mockReturnValue(isPublic),
  } as unknown as Reflector;
}

function createContext(authorizationHeader: string | undefined): {
  context: ExecutionContext;
  request: Request;
} {
  const request = {
    headers: { authorization: authorizationHeader },
  } as unknown as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard', () => {
  const oidcConfig: OidcConfig = {
    issuerUrl: ISSUER,
    audience: AUDIENCE,
    adminRole: 'ts-icon-admin',
    editorRole: 'ts-icon-editor',
  };

  let signingKey: KeyLike;
  let localJwks: JWTVerifyGetKey;
  let otherKey: KeyLike;

  const kid = 'test-key';

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    signingKey = privateKey;
    const jwk = await exportJWK(publicKey);
    jwk.kid = kid;
    jwk.alg = 'RS256';
    localJwks = createLocalJWKSet({ keys: [jwk] });

    // A second, unrelated keypair whose public key is never published in
    // the JWKS above -- used to simulate a token forged/tampered with a key
    // the verifier does not trust.
    const otherPair = await generateKeyPair('RS256');
    otherKey = otherPair.privateKey;
  });

  function signToken(
    overrides: {
      issuer?: string;
      audience?: string | string[];
      subject?: string;
      roles?: string[];
      expiresIn?: string;
      signingKeyOverride?: KeyLike;
    } = {},
  ): Promise<string> {
    const {
      issuer = ISSUER,
      audience = AUDIENCE,
      subject = 'user-123',
      roles = ['ts-icon-editor'],
      expiresIn = '5m',
      signingKeyOverride,
    } = overrides;

    return new SignJWT({
      realm_access: { roles },
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(subject)
      .setExpirationTime(expiresIn)
      .sign(signingKeyOverride ?? signingKey);
  }

  function createGuard(
    metrics: MetricsService = createMetricsService(),
  ): JwtAuthGuard {
    return new JwtAuthGuard(
      createReflectorStub(false),
      localJwks,
      oidcConfig,
      metrics,
    );
  }

  it('accepts a valid token and attaches sub + roles to the request', async () => {
    const guard = createGuard();
    const token = await signToken({
      subject: 'alice',
      roles: ['ts-icon-editor'],
    });
    const { context, request } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ sub: 'alice', roles: ['ts-icon-editor'] });
  });

  it('accepts a token whose aud claim is an array containing the configured audience', async () => {
    const guard = createGuard();
    const token = await signToken({
      audience: ['some-other-client', AUDIENCE],
    });
    const { context } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects a missing Authorization header', async () => {
    const guard = createGuard();
    const { context } = createContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a malformed Authorization header (no Bearer prefix)', async () => {
    const guard = createGuard();
    const token = await signToken();
    const { context } = createContext(token); // missing "Bearer " prefix

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', async () => {
    const guard = createGuard();
    const token = await signToken({ expiresIn: '-10s' });
    const { context } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token from the wrong issuer', async () => {
    const guard = createGuard();
    const token = await signToken({
      issuer: 'https://not-our-issuer.example.com/realms/other',
    });
    const { context } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token with the wrong audience', async () => {
    const guard = createGuard();
    const token = await signToken({ audience: 'some-other-client' });
    const { context } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token signed with a key not present in the JWKS (tampered/forged signature)', async () => {
    const guard = createGuard();
    const token = await signToken({ signingKeyOverride: otherKey });
    const { context } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token whose signature bytes were tampered with after signing', async () => {
    const guard = createGuard();
    const token = await signToken();
    const parts = token.split('.');
    // Flip the *first* character of the signature segment rather than the
    // last -- base64url's final character can encode padding bits that
    // don't correspond to a full byte, so mutating it can occasionally
    // decode to the same underlying bytes and make this test flaky. The
    // first character always sits at a full byte boundary.
    const firstChar = parts[2].charAt(0);
    parts[2] = (firstChar === 'A' ? 'B' : 'A') + parts[2].slice(1);
    const tampered = parts.join('.');
    const { context } = createContext(`Bearer ${tampered}`);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('bypasses verification entirely for a route marked @Public()', async () => {
    const guard = new JwtAuthGuard(
      createReflectorStub(true),
      localJwks,
      oidcConfig,
      createMetricsService(),
    );
    const { context } = createContext(undefined);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('increments the auth-failure counter when a request is rejected', async () => {
    const { metrics, inc } = createMetricsStub();
    const guard = createGuard(metrics);
    const { context } = createContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(inc).toHaveBeenCalledTimes(1);
  });

  it('does not increment the auth-failure counter for an accepted request', async () => {
    const { metrics, inc } = createMetricsStub();
    const guard = createGuard(metrics);
    const token = await signToken();
    const { context } = createContext(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(inc).not.toHaveBeenCalled();
  });
});
