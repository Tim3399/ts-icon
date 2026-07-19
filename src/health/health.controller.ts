import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { HealthService } from './health.service';

interface LivenessResponse {
  status: 'ok';
}

interface ReadinessResponse {
  status: 'ok';
}

/**
 * Minimal, unauthenticated status shape for a failed readiness check.
 * Deliberately excludes error messages, stack traces, or anything else that
 * could reveal internal implementation details over this unauthenticated
 * endpoint — `check` only ever names which dependency failed (e.g.
 * `'database'`), nothing about *why*. The full reason is logged server-side
 * by HealthService instead.
 */
interface ReadinessFailure {
  status: 'error';
  check: 'database';
}

/**
 * Health endpoints for container/orchestrator probes. Registered in both the
 * `public` and `local` app modules so each app reports on its own process
 * and its own database connection.
 *
 * Both routes are marked `@Public()` so they're reachable without a bearer
 * token: the `local` app applies a global JWT guard that would otherwise
 * reject Docker/CI healthchecks that can't supply credentials. `@Public()`
 * has no effect in the `public` app, which has no such guard, so the same
 * controller works unchanged in both.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness: "is the process able to respond at all". Intentionally checks
   * nothing beyond that — no database, no TeamSpeak reachability — so a
   * slow or unreachable dependency never causes an orchestrator to restart
   * an otherwise-healthy process. Use /health/ready for dependency checks.
   */
  @Public()
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liveness probe: confirms the process is running and responsive',
  })
  live(): LivenessResponse {
    return { status: 'ok' };
  }

  /**
   * Readiness: confirms the app can actually serve real traffic by
   * exercising the database connection. Returns 503 with only a minimal,
   * non-identifying body when unhealthy — see ReadinessFailure.
   */
  @Public()
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Readiness probe: confirms the database connection is reachable',
  })
  async ready(): Promise<ReadinessResponse> {
    const databaseReachable = await this.healthService.checkDatabase();
    if (!databaseReachable) {
      const failure: ReadinessFailure = { status: 'error', check: 'database' };
      throw new ServiceUnavailableException(failure);
    }
    return { status: 'ok' };
  }
}
