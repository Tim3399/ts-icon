import type { LogLevel } from '@nestjs/common';
import { resolveEnabledLogLevels } from './log-level';

describe('resolveEnabledLogLevels', () => {
  it('includes every level from the given minimum severity upward', () => {
    expect(resolveEnabledLogLevels('warn')).toEqual(['warn', 'error', 'fatal']);
  });

  it('includes all levels when the minimum is verbose', () => {
    expect(resolveEnabledLogLevels('verbose')).toEqual([
      'verbose',
      'debug',
      'log',
      'warn',
      'error',
      'fatal',
    ]);
  });

  it('includes only fatal when the minimum is fatal', () => {
    expect(resolveEnabledLogLevels('fatal')).toEqual(['fatal']);
  });

  it('includes log and everything more severe when the minimum is log', () => {
    expect(resolveEnabledLogLevels('log')).toEqual([
      'log',
      'warn',
      'error',
      'fatal',
    ]);
  });

  it('falls back to every level for an unrecognized value rather than logging nothing', () => {
    expect(resolveEnabledLogLevels('nonsense' as LogLevel)).toEqual([
      'verbose',
      'debug',
      'log',
      'warn',
      'error',
      'fatal',
    ]);
  });
});
