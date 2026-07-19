import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Marks a route (or an entire controller) as requiring at least one of the
 * given Keycloak client roles. Enforced by RolesGuard, which reads the
 * roles JwtAuthGuard attached to `req.user` after verifying the token.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
