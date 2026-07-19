import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or an entire controller) as exempt from JwtAuthGuard.
 * Nothing in the `local` app uses this today — both URL-import endpoints
 * are intentionally kept behind auth like everything else (see
 * agents/AGENTS.md's 2026-07-18 decision) — but JwtAuthGuard already checks
 * for it via Reflector so a future genuinely-public route (if one is ever
 * needed) doesn't require touching the guard itself.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
