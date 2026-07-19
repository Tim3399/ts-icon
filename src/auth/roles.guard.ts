import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator';
import { OIDC_CONFIG } from './auth.tokens';
import type { OidcConfig } from '../../config';
import { MetricsService } from '../metrics/metrics.service';

/**
 * Enforces `@Roles(...)` on a route, reading the Keycloak client roles
 * JwtAuthGuard already attached to `req.user.roles`. Must run after
 * JwtAuthGuard (see AuthModule's provider order — Nest runs multiple
 * `APP_GUARD`s in registration order) so `req.user` is populated by the
 * time this guard reads it.
 *
 * Role hierarchy: the admin role is treated as a superset of the editor
 * role, not a separate, disjoint permission — an admin can do everything an
 * editor can, so a route gated with `@Roles(OIDC_EDITOR_ROLE)` also accepts
 * a caller who only holds the admin role. Routes gated with
 * `@Roles(OIDC_ADMIN_ROLE)` still require the admin role specifically
 * (editor does not imply admin).
 *
 * A route with no `@Roles(...)` at all is allowed through unconditionally —
 * role requirements are opt-in per route, on top of the mandatory JWT check
 * every route already gets from JwtAuthGuard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(OIDC_CONFIG) private readonly oidcConfig: OidcConfig,
    private readonly metrics: MetricsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user) {
      // Should be unreachable in practice (JwtAuthGuard runs first and
      // either populates req.user or rejects the request with a 401 before
      // this guard ever runs) -- but fail closed rather than throwing an
      // unhandled TypeError if guard ordering is ever changed.
      this.metrics.authorizationFailuresTotal.inc();
      throw new ForbiddenException();
    }

    const effectiveRoles = new Set(user.roles);
    if (effectiveRoles.has(this.oidcConfig.adminRole)) {
      effectiveRoles.add(this.oidcConfig.editorRole);
    }

    const satisfied = requiredRoles.some((role) => effectiveRoles.has(role));
    if (!satisfied) {
      this.metrics.authorizationFailuresTotal.inc();
      throw new ForbiddenException();
    }
    return true;
  }
}
