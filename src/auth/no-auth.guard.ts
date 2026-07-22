import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { isPrivateOrLoopbackAddress } from '../metrics/private-network.guard';
import type { RequestUser } from './request-user';

/**
 * Synthetic subject attached to req.user in AUTH_DISABLED mode -- there is
 * no real Keycloak-issued subject to use, and this value is deliberately
 * distinctive so it's unmistakable in logs/audit entries (see
 * AuditLoggingInterceptor, which reads request.user?.sub).
 */
const AUTH_DISABLED_SUBJECT = 'auth-disabled';

/**
 * Replaces JwtAuthGuard + RolesGuard entirely when AUTH_DISABLED=true (see
 * config.ts's isAuthDisabled() and AuthModule). Two responsibilities:
 *
 *  - Defense-in-depth: AUTH_DISABLED is documented as a loopback-only escape
 *    hatch and refuses to start under NODE_ENV=production, but nothing else
 *    stops it from being set on a non-production host that is still
 *    network-reachable. This guard independently rejects any caller whose
 *    source address isn't loopback/private -- reusing the exact same check
 *    PrivateNetworkGuard uses to restrict the public app's /metrics
 *    endpoint -- so a misconfigured host doesn't silently become an open
 *    admin API.
 *  - Compatibility: attaches a synthetic req.user so downstream code that
 *    reads it (AuditLoggingInterceptor's request.user?.sub) still behaves
 *    sensibly instead of logging "unknown" for every action.
 *
 * RolesGuard is not registered at all in this mode (see AuthModule), so
 * there is no @Roles() enforcement to satisfy -- the roles array is left
 * empty rather than populated with anything meaningful.
 */
@Injectable()
export class NoAuthGuard implements CanActivate {
  private readonly logger = new Logger(NoAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const callerAddress = request.ip;
    if (!callerAddress || !isPrivateOrLoopbackAddress(callerAddress)) {
      this.logger.warn(
        `Rejected request from a non-private address while AUTH_DISABLED=true: ${callerAddress ?? 'unknown'}`,
      );
      throw new ForbiddenException();
    }
    const user: RequestUser = { sub: AUTH_DISABLED_SUBJECT, roles: [] };
    request.user = user;
    return true;
  }
}
