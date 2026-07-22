import { Module, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { JWTVerifyGetKey } from 'jose';
import { getOidcConfig, isAuthDisabled, type OidcConfig } from '../../config';
import { JWKS_KEY_GETTER, OIDC_CONFIG } from './auth.tokens';
import { createJwksKeyGetter } from './jwks';
import { JwtAuthGuard } from './jwt-auth.guard';
import { NoAuthGuard } from './no-auth.guard';
import { RolesGuard } from './roles.guard';
import { MetricsModule } from '../metrics/metrics.module';

/**
 * Builds the provider set for whichever mode is configured. Extracted into
 * a plain, exported function (rather than inlined in the `@Module`
 * decorator below) so the branching itself is unit-testable without
 * booting a real Nest module — see auth.module.spec.ts.
 *
 * When AUTH_DISABLED=true (config.ts's isAuthDisabled()), the entire
 * provider set is swapped for a single NoAuthGuard: no OIDC_CONFIG/
 * JWKS_KEY_GETTER providers are registered (so OIDC_ISSUER_URL/OIDC_AUDIENCE
 * need not be set in this mode), and RolesGuard is not registered either —
 * there is no @Roles() enforcement in this mode, only NoAuthGuard's own
 * loopback/private-network restriction.
 *
 * Otherwise, provider order matters: Nest runs multiple `APP_GUARD`s in the
 * order they're registered here, and RolesGuard reads `req.user`, which only
 * JwtAuthGuard populates -- so JwtAuthGuard must come first.
 */
export function buildAuthProviders(): Provider[] {
  if (isAuthDisabled()) {
    return [{ provide: APP_GUARD, useClass: NoAuthGuard }];
  }
  return [
    {
      provide: OIDC_CONFIG,
      useFactory: (): OidcConfig => getOidcConfig(),
    },
    {
      provide: JWKS_KEY_GETTER,
      useFactory: (oidcConfig: OidcConfig): JWTVerifyGetKey =>
        createJwksKeyGetter(oidcConfig.issuerUrl),
      inject: [OIDC_CONFIG],
    },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ];
}

/**
 * Wires up global JWT + role enforcement for whichever app imports it.
 * Registers guards as `APP_GUARD` providers (rather than
 * `app.useGlobalGuards(...)` in main.ts) so they participate in Nest's
 * regular DI graph — each guard needs injected config/JWKS providers, and
 * `APP_GUARD` is the idiomatic way to get that without manually
 * constructing guard instances in the bootstrap file.
 *
 * MetricsModule is imported so guards can have MetricsService injected to
 * record auth/authorization failures directly at their existing rejection
 * points.
 */
@Module({
  imports: [MetricsModule],
  providers: buildAuthProviders(),
})
export class AuthModule {}
