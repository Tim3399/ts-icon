import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { JWTVerifyGetKey } from "jose";
import type { Request } from "express";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { JWKS_KEY_GETTER, OIDC_CONFIG } from "./auth.tokens";
import { toRequestUser } from "./request-user";
import { extractBearerToken, verifyAccessToken } from "./verify-access-token";
import type { OidcConfig } from "../../config";
import { MetricsService } from "../metrics/metrics.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  constructor(
    private readonly reflector: Reflector,
    @Inject(JWKS_KEY_GETTER) private readonly getKey: JWTVerifyGetKey,
    @Inject(OIDC_CONFIG) private readonly oidcConfig: OidcConfig,
    private readonly metrics: MetricsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request.headers.authorization);
    try {
      if (!token) throw new Error("Missing bearer token");
      request.user = toRequestUser(await verifyAccessToken(token, this.getKey, this.oidcConfig));
      return true;
    } catch {
      this.logger.warn("Rejected request with missing or invalid authentication");
      this.metrics.authFailuresTotal.inc();
      throw new UnauthorizedException();
    }
  }
}
