import { AppLogger } from './app-logger';
import { runWithRequestContext } from './request-context';

interface JsonLogLine {
  timestamp: string;
  level: string;
  context?: string;
  message: unknown;
  requestId?: string;
  stack?: unknown;
}

function captureWrites(): { lines: () => string[] } {
  const written: string[] = [];
  jest
    .spyOn(process.stdout, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      written.push(chunk.toString());
      return true;
    });
  jest
    .spyOn(process.stderr, 'write')
    .mockImplementation((chunk: string | Uint8Array) => {
      written.push(chunk.toString());
      return true;
    });
  return { lines: () => written };
}

function parseJsonLines(lines: string[]): JsonLogLine[] {
  return lines.map((line) => JSON.parse(line.trim()) as JsonLogLine);
}

describe('AppLogger', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('JSON mode', () => {
    it('emits one JSON object per line with timestamp/level/context/message', () => {
      const capture = captureWrites();
      const logger = new AppLogger({ json: true, logLevel: 'log' });

      logger.log('hello world', 'TestContext');

      const [entry] = parseJsonLines(capture.lines());
      expect(entry.level).toBe('log');
      expect(entry.context).toBe('TestContext');
      expect(entry.message).toBe('hello world');
      expect(typeof entry.timestamp).toBe('string');
      expect(new Date(entry.timestamp).toString()).not.toBe('Invalid Date');
      expect(entry.requestId).toBeUndefined();
    });

    it('omits the context field entirely when no context was given', () => {
      const capture = captureWrites();
      const logger = new AppLogger({ json: true, logLevel: 'log' });

      logger.log('no context here');

      const [entry] = parseJsonLines(capture.lines());
      expect(entry.context).toBeUndefined();
      expect('context' in entry).toBe(false);
    });

    it('includes the current request id from AsyncLocalStorage', () => {
      const capture = captureWrites();
      const logger = new AppLogger({ json: true, logLevel: 'log' });

      runWithRequestContext({ requestId: 'req-123' }, () => {
        logger.log('inside a request', 'TestContext');
      });

      const [entry] = parseJsonLines(capture.lines());
      expect(entry.requestId).toBe('req-123');
    });

    it('does not leak a request id between two concurrently handled "requests"', async () => {
      const capture = captureWrites();
      const logger = new AppLogger({ json: true, logLevel: 'log' });

      await Promise.all([
        runWithRequestContext({ requestId: 'req-a' }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          logger.log('message from a', 'TestContext');
        }),
        runWithRequestContext({ requestId: 'req-b' }, () => {
          logger.log('message from b', 'TestContext');
        }),
      ]);

      const entries = parseJsonLines(capture.lines());
      const fromA = entries.find((e) => e.message === 'message from a');
      const fromB = entries.find((e) => e.message === 'message from b');
      expect(fromA?.requestId).toBe('req-a');
      expect(fromB?.requestId).toBe('req-b');
    });
  });

  describe('level filtering', () => {
    it('suppresses messages below the configured minimum level', () => {
      const capture = captureWrites();
      const logger = new AppLogger({ json: true, logLevel: 'warn' });

      logger.verbose('suppressed');
      logger.debug('suppressed');
      logger.log('suppressed');
      logger.warn('kept');
      logger.error('kept too');

      const messages = parseJsonLines(capture.lines()).map((e) => e.message);
      expect(messages).toEqual(['kept', 'kept too']);
    });

    it('prints every level when configured for verbose', () => {
      const capture = captureWrites();
      const logger = new AppLogger({ json: true, logLevel: 'verbose' });

      logger.verbose('v');
      logger.debug('d');
      logger.log('l');
      logger.warn('w');
      logger.error('e');

      const messages = parseJsonLines(capture.lines()).map((e) => e.message);
      expect(messages).toEqual(['v', 'd', 'l', 'w', 'e']);
    });
  });

  describe('human-readable mode', () => {
    it('produces non-JSON output that includes the message and the request id', () => {
      const capture = captureWrites();
      const logger = new AppLogger({ json: false, logLevel: 'log' });

      runWithRequestContext({ requestId: 'req-plain' }, () => {
        logger.log('plain text message', 'TestContext');
      });

      const [line] = capture.lines();
      expect(line).toContain('plain text message');
      expect(line).toContain('req-plain');
      expect(() => JSON.parse(line) as unknown).toThrow();
    });

    it('omits the request id bracket entirely outside of any request context', () => {
      const capture = captureWrites();
      const logger = new AppLogger({ json: false, logLevel: 'log' });

      logger.log('bootstrap message', 'Bootstrap');

      const [line] = capture.lines();
      expect(line).toContain('bootstrap message');
      expect(line).not.toMatch(/\[req-/);
    });
  });
});
