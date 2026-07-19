import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import ipaddr from 'ipaddr.js';
import { classifyIpRange } from '../images/ssrf-guard';

/**
 * Ranges a caller's own source address is allowed to fall into to reach the
 * `public` app's /metrics endpoint. Deliberately narrower than "anything
 * that isn't 'unicast'": ssrf-guard's isBlockedIp also rejects multicast/
 * reserved/carrierGradeNat/teredo/6to4/etc. ranges because those are all
 * illegitimate *fetch targets* -- but none of them can ever be a real TCP
 * peer's own source address either, so leaving them out of this allowlist
 * changes nothing in practice. This list is just the ranges an actual
 * loopback/private-network caller could really have.
 */
const PRIVATE_CALLER_RANGES = new Set([
  'loopback',
  'private',
  'uniqueLocal',
  'linkLocal',
]);

/**
 * Unwraps an IPv4-mapped IPv6 address (e.g. "::ffff:127.0.0.1" -- how Node
 * reports an IPv4 peer's address on a dual-stack listener) to its plain
 * IPv4 form before classifying it.
 *
 * This is the opposite direction from ssrf-guard's isBlockedIp, which
 * deliberately leaves that form un-unwrapped so it's always rejected
 * outright (closing a filter-bypass trick against a caller-*supplied* fetch
 * target). Here the address is the server's own record of who actually
 * connected, not a client-supplied value to distrust -- recovering the real
 * embedded address is what makes a genuine IPv4 loopback scrape on a
 * dual-stack listener actually get recognized as loopback, instead of being
 * rejected just because of how the socket happened to report it.
 */
function normalizeCallerAddress(address: string): string {
  try {
    return ipaddr.process(address).toString();
  } catch {
    return address;
  }
}

/**
 * Whether an address is safe to treat as "on our own network" for the
 * purpose of exposing internal operational data (Prometheus metrics).
 *
 * Shares `classifyIpRange` with ssrf-guard.ts's `isBlockedIp` rather than
 * re-deriving IP-range classification a second time. The two checks are
 * intentionally opposite in direction: `isBlockedIp` default-denies
 * everything except public 'unicast' addresses, since it's guarding an
 * outbound fetch *target*; this default-denies everything except the
 * specific ranges a real private-network caller could have, since it's
 * guarding inbound access from a caller.
 */
export function isPrivateOrLoopbackAddress(address: string): boolean {
  const range = classifyIpRange(normalizeCallerAddress(address));
  return range !== null && PRIVATE_CALLER_RANGES.has(range);
}

/**
 * Restricts a route to callers whose source IP is loopback or a private
 * range. Used only on the `public` app's /metrics endpoint (see
 * PublicMetricsController) -- that app has no authentication anywhere else
 * by design (a world-readable image endpoint, rate-limited instead), so an
 * unrestricted /metrics there would leak internal operational data to
 * anyone on the internet.
 *
 * Reads Express's own `req.ip`, which reflects the real TCP peer address
 * unless Express's `trust proxy` setting is enabled (it is not, anywhere in
 * this app) -- never a client-suppliable header.
 */
@Injectable()
export class PrivateNetworkGuard implements CanActivate {
  private readonly logger = new Logger(PrivateNetworkGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const callerAddress = request.ip;
    if (!callerAddress || !isPrivateOrLoopbackAddress(callerAddress)) {
      this.logger.warn(
        `Rejected /metrics request from a non-private address: ${callerAddress ?? 'unknown'}`,
      );
      throw new ForbiddenException();
    }
    return true;
  }
}
