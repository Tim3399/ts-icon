import { APP_GUARD } from '@nestjs/core';
import { buildAuthProviders } from './auth.module';
import { OIDC_CONFIG, JWKS_KEY_GETTER } from './auth.tokens';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { NoAuthGuard } from './no-auth.guard';

describe('buildAuthProviders', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('registers only NoAuthGuard when AUTH_DISABLED=true', () => {
    process.env.AUTH_DISABLED = 'true';

    const providers = buildAuthProviders();

    expect(providers).toEqual([{ provide: APP_GUARD, useClass: NoAuthGuard }]);
  });

  it('registers OIDC_CONFIG, JWKS_KEY_GETTER, JwtAuthGuard, then RolesGuard when AUTH_DISABLED is unset', () => {
    delete process.env.AUTH_DISABLED;

    const providers = buildAuthProviders();

    const tokens = providers.map((p) =>
      'provide' in p ? p.provide : undefined,
    );
    expect(tokens).toEqual([
      OIDC_CONFIG,
      JWKS_KEY_GETTER,
      APP_GUARD,
      APP_GUARD,
    ]);

    // JwtAuthGuard must precede RolesGuard -- RolesGuard reads req.user,
    // which only JwtAuthGuard populates (see AuthModule's ordering comment).
    const guardClasses = providers
      .filter((p) => 'useClass' in p)
      .map((p) => (p as { useClass: unknown }).useClass);
    expect(guardClasses).toEqual([JwtAuthGuard, RolesGuard]);
  });
});
