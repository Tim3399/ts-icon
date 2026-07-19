import { getRequestId, runWithRequestContext } from './request-context';

describe('request context (AsyncLocalStorage)', () => {
  it('returns undefined outside of any request context', () => {
    expect(getRequestId()).toBeUndefined();
  });

  it('exposes the request id set via runWithRequestContext, and clears it afterwards', () => {
    runWithRequestContext({ requestId: 'abc-123' }, () => {
      expect(getRequestId()).toBe('abc-123');
    });

    expect(getRequestId()).toBeUndefined();
  });

  it('propagates the request id across awaited async work within the same context', async () => {
    await runWithRequestContext({ requestId: 'async-id' }, async () => {
      expect(getRequestId()).toBe('async-id');
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(getRequestId()).toBe('async-id');
    });
  });

  it('keeps two concurrently running "requests" from leaking into each other', async () => {
    const seenInA: (string | undefined)[] = [];
    const seenInB: (string | undefined)[] = [];

    await Promise.all([
      runWithRequestContext({ requestId: 'req-a' }, async () => {
        seenInA.push(getRequestId());
        // Yield so request B's synchronous work interleaves with this one.
        await new Promise((resolve) => setTimeout(resolve, 5));
        seenInA.push(getRequestId());
      }),
      runWithRequestContext({ requestId: 'req-b' }, () => {
        seenInB.push(getRequestId());
        seenInB.push(getRequestId());
      }),
    ]);

    expect(seenInA).toEqual(['req-a', 'req-a']);
    expect(seenInB).toEqual(['req-b', 'req-b']);
  });

  it('supports nested contexts, with the inner one taking precedence while active', () => {
    runWithRequestContext({ requestId: 'outer' }, () => {
      expect(getRequestId()).toBe('outer');
      runWithRequestContext({ requestId: 'inner' }, () => {
        expect(getRequestId()).toBe('inner');
      });
      expect(getRequestId()).toBe('outer');
    });
  });
});
