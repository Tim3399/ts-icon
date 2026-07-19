import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { JWTVerifyGetKey } from 'jose';
import { getOidcConfig, type OidcConfig } from '../../config';
import { JWKS_KEY_GETTER, OIDC_CONFIG } from './auth.tokens';
import { createJwksKeyGetter } from './jwks';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { MetricsModule } from '../metrics/metrics.module';

/**
 * Wires up global JWT + role enforcement for whichever app imports it.
 * Registers both guards as `APP_GUARD` providers (rather than
 * `app.useGlobalGuards(...)` in main.ts) so they participate in Nest's
 * regular DI graph — each guard needs injected config/JWKS providers, and
 * `APP_GUARD` is the idiomatic way to get that without manually
 * constructing guard instances in the bootstrap file.
 *
 * Provider order matters: Nest runs multiple `APP_GUARD`s in the order
 * they're registered here, and RolesGuard reads `req.user`, which only
 * JwtAuthGuard populates -- so JwtAuthGuard must come first.
 *
 * MetricsModule is imported so both guards can have MetricsService injected
 * to record auth/authorization failures directly at their existing
 * rejection points.
 */
@Module({
  imports: [MetricsModule],
  providers: [
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
  ],
})
export class AuthModule {}
