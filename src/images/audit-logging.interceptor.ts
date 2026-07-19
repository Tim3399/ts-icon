import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { normalizeChannelName } from '../util/util';

export const AUDIT_ACTION_KEY = 'auditAction';

/**
 * Marks a route as a mutating admin action that should produce an audit log
 * entry once it completes successfully. Read by AuditLoggingInterceptor,
 * which is attached only to the specific routes that need it.
 */
export const AuditAction = (action: string) =>
  SetMetadata(AUDIT_ACTION_KEY, action);

interface AuditableRequestBody {
  channelName?: unknown;
}

const UNKNOWN_CHANNEL = 'unknown';
const UNKNOWN_SUBJECT = 'unknown';

/**
 * Writes a structured audit log entry after a mutating admin action
 * completes successfully. Implemented as an interceptor (using `tap()`
 * around the route handler) rather than a manual log call inside each
 * controller method, so it stays consistently applied and — the important
 * part — only ever fires on success: `tap()`'s callback only runs when the
 * underlying observable completes normally. A request that throws before
 * that point (a validation error, an SSRF rejection, an upstream fetch
 * failure, TeamSpeak being unreachable, etc.) never reaches it, so nothing
 * gets logged for a failed or rejected request.
 *
 * Only identifiers are logged: the Keycloak subject, a timestamp, the
 * action name, and the channel name involved — never image bytes, full
 * request bodies, or tokens.
 */
@Injectable()
export class AuditLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditLog');

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string | undefined>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );
    if (!action) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const channelName = this.extractChannelName(request);
    const subject = request.user?.sub || UNKNOWN_SUBJECT;

    return next.handle().pipe(
      tap(() => {
        this.logger.log({
          action,
          subject,
          channelName,
          timestamp: new Date().toISOString(),
        });
      }),
    );
  }

  /**
   * The channel name lives in a different place depending on the route: a
   * `:channelName` route param for the direct-upload endpoint, or a
   * `channelName` field in the JSON body for the URL-import endpoint. The
   * route param is checked first since it's the more specific source of the
   * two when (hypothetically) both were present on the same request.
   */
  private extractChannelName(request: Request): string {
    const paramName = request.params?.channelName;
    if (typeof paramName === 'string' && paramName.length > 0) {
      return normalizeChannelName(paramName);
    }

    const body = request.body as AuditableRequestBody | undefined;
    if (typeof body?.channelName === 'string' && body.channelName.length > 0) {
      return normalizeChannelName(body.channelName);
    }

    return UNKNOWN_CHANNEL;
  }
}
