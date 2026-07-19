import type { LogLevel } from '@nestjs/common';

/**
 * Nest's own severity ordering (least to most severe) — matches the order
 * used internally by `@nestjs/common`'s `ConsoleLogger`/`isLogLevelEnabled`.
 */
const LOG_LEVEL_ORDER: LogLevel[] = [
  'verbose',
  'debug',
  'log',
  'warn',
  'error',
  'fatal',
];

/**
 * Expands a single configured minimum severity (e.g. `LOG_LEVEL=warn`) into
 * the full list of levels that should actually be printed: the given level
 * and everything more severe than it. `ConsoleLoggerOptions.logLevels`
 * expects this kind of explicit list rather than a single cutoff value, so
 * this is the one place that translates "warn and above" into
 * `['warn', 'error', 'fatal']`.
 *
 * Falls back to every level (least restrictive) if given a value outside
 * the known set, rather than silently logging nothing.
 */
export function resolveEnabledLogLevels(minLevel: LogLevel): LogLevel[] {
  const index = LOG_LEVEL_ORDER.indexOf(minLevel);
  if (index === -1) {
    return LOG_LEVEL_ORDER;
  }
  return LOG_LEVEL_ORDER.slice(index);
}
