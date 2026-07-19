import { ConsoleLogger } from '@nestjs/common';
import type { LogLevel } from '@nestjs/common';
import { getRequestId } from './request-context';
import { resolveEnabledLogLevels } from './log-level';

export interface AppLoggerOptions {
  /** Emit one JSON object per line instead of the colored text format. */
  json: boolean;
  /** Minimum severity to print; everything less severe is suppressed. */
  logLevel: LogLevel;
}

interface PrintAsJsonOptions {
  context: string;
  logLevel: LogLevel;
  writeStreamType?: 'stdout' | 'stderr';
  errorStack?: unknown;
}

/**
 * Turns `Error` instances (and bigints, which `JSON.stringify` otherwise
 * throws on) into something serializable, mirroring what Nest's own JSON
 * logger does for the same reason.
 */
function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

/**
 * The single logger instance passed to `NestFactory.create(AppModule,
 * { logger })` in both apps' bootstraps. Every existing `new
 * Logger('SomeContext')` call site throughout the codebase keeps working
 * unchanged — Nest's `Logger` class forwards `.log()`/`.warn()`/etc. calls
 * to whatever logger instance was registered this way, so this class only
 * needs to change *how* a line is formatted once it reaches here, not any
 * of the ~dozen call sites already sprinkled through the codebase.
 *
 * Extends `ConsoleLogger` (rather than implementing `LoggerService` from
 * scratch) to reuse its level-filtering (`isLevelEnabled`) and
 * context/stack-trace extraction logic as-is, and only overrides the two
 * methods that actually decide what gets written to stdout/stderr:
 * `printAsJson` (production/JSON mode) and `formatContext` (human-readable
 * mode, to splice the current request id in next to the logger context).
 */
export class AppLogger extends ConsoleLogger {
  constructor({ json, logLevel }: AppLoggerOptions) {
    super({
      json,
      logLevels: resolveEnabledLogLevels(logLevel),
    });
  }

  /**
   * Human-readable mode: appends the current request id (if any) right
   * after the logger context, e.g. `[HealthService] [a1b2c3d4-...] `.
   * Falls back to the unmodified context formatting outside of any request
   * (e.g. bootstrap logs), where there is no request id to show.
   */
  protected formatContext(context: string): string {
    const base = super.formatContext(context);
    const requestId = getRequestId();
    return requestId ? `${base}[${requestId}] ` : base;
  }

  /**
   * JSON mode: one self-contained JSON object per log line, always
   * including `timestamp`/`level`/`message`, and `context`/`requestId`/
   * `stack` whenever they're actually available. Deliberately written from
   * scratch rather than delegating to `ConsoleLogger`'s own `printAsJson`
   * (which has no request id to add and writes directly to the stream
   * itself, leaving nothing to post-process).
   */
  protected printAsJson(message: unknown, options: PrintAsJsonOptions): void {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level: options.logLevel,
      context: options.context || undefined,
      message,
      requestId: getRequestId(),
      stack: options.errorStack,
    };

    for (const key of Object.keys(entry)) {
      if (entry[key] === undefined) {
        delete entry[key];
      }
    }

    const stream = options.writeStreamType ?? 'stdout';
    process[stream].write(`${JSON.stringify(entry, jsonReplacer)}\n`);
  }
}
