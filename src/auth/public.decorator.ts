import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or an entire controller) as exempt from JwtAuthGuard.
 * Used by the health check endpoints (see src/health/), since container
 * orchestrators and CI need to reach them without a bearer token. Everything
 * else in the `local` app, including the URL-import endpoints, is
 * intentionally kept behind auth.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
