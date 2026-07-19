import {
  Logger,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { of, throwError, firstValueFrom, type Observable } from 'rxjs';
import {
  AUDIT_ACTION_KEY,
  AuditLoggingInterceptor,
} from './audit-logging.interceptor';
import type { RequestUser } from '../auth/request-user';

function createReflectorStub(action: string | undefined): Reflector {
  return {
    get: jest.fn().mockReturnValue(action),
  } as unknown as Reflector;
}

// Returns the jest.fn() reference directly (rather than reading `.get` back
// off the stub later) to avoid @typescript-eslint/unbound-method, which
// flags any bare reference to a class's method as a value even when nothing
// here calls it with a `this` binding.
function createReflectorStubWithSpy(action: string | undefined): {
  reflector: Reflector;
  getSpy: jest.Mock;
} {
  const getSpy = jest.fn().mockReturnValue(action);
  return { reflector: { get: getSpy } as unknown as Reflector, getSpy };
}

function createContext(request: Partial<Request>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function createHandler<T>(observable: Observable<T>): CallHandler {
  return { handle: () => observable } as CallHandler;
}

describe('AuditLoggingInterceptor', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('logs one audit entry with the correct subject/channel/action after a successful upload', async () => {
    const reflector = createReflectorStub('upload');
    const interceptor = new AuditLoggingInterceptor(reflector);
    const user: RequestUser = { sub: 'user-123', roles: ['ts-icon-editor'] };
    const context = createContext({
      params: { channelName: 'My Channel' },
      user,
    });
    const handler = createHandler(of({ message: 'Image saved successfully' }));

    const result = await firstValueFrom(
      interceptor.intercept(context, handler),
    );

    expect(result).toEqual({ message: 'Image saved successfully' });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const [entry] = logSpy.mock.calls[0] as [Record<string, unknown>];
    expect(entry).toMatchObject({
      action: 'upload',
      subject: 'user-123',
      channelName: 'my-channel',
    });
    expect(typeof entry.timestamp).toBe('string');
    expect(() =>
      new Date(entry.timestamp as string).toISOString(),
    ).not.toThrow();
  });

  it('logs one audit entry for a successful from-url import, reading channelName from the body', async () => {
    const reflector = createReflectorStub('from-url');
    const interceptor = new AuditLoggingInterceptor(reflector);
    const user: RequestUser = { sub: 'user-456', roles: ['ts-icon-editor'] };
    const context = createContext({
      params: {},
      body: { channelName: 'Other Channel', url: 'https://example.com/a.png' },
      user,
    });
    const handler = createHandler(of({ message: 'Image saved successfully' }));

    await firstValueFrom(interceptor.intercept(context, handler));

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [entry] = logSpy.mock.calls[0] as [Record<string, unknown>];
    expect(entry).toMatchObject({
      action: 'from-url',
      subject: 'user-456',
      channelName: 'other-channel',
    });
  });

  it('does not log anything when the underlying handler throws', async () => {
    const reflector = createReflectorStub('upload');
    const interceptor = new AuditLoggingInterceptor(reflector);
    const context = createContext({
      params: { channelName: 'chan' },
      user: { sub: 'user-123', roles: ['ts-icon-editor'] },
    });
    const handler = createHandler(
      throwError(() => new Error('rejected before success')),
    );

    await expect(
      firstValueFrom(interceptor.intercept(context, handler)),
    ).rejects.toThrow('rejected before success');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('passes requests through without logging when the route has no @AuditAction metadata', async () => {
    const reflector = createReflectorStub(undefined);
    const interceptor = new AuditLoggingInterceptor(reflector);
    const context = createContext({ params: {}, user: undefined });
    const handler = createHandler(of({ channels: ['a', 'b'] }));

    const result = await firstValueFrom(
      interceptor.intercept(context, handler),
    );

    expect(result).toEqual({ channels: ['a', 'b'] });
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('falls back to "unknown" for the subject when req.user is missing', async () => {
    const reflector = createReflectorStub('upload');
    const interceptor = new AuditLoggingInterceptor(reflector);
    const context = createContext({
      params: { channelName: 'chan' },
      user: undefined,
    });
    const handler = createHandler(of({ message: 'ok' }));

    await firstValueFrom(interceptor.intercept(context, handler));

    const [entry] = logSpy.mock.calls[0] as [Record<string, unknown>];
    expect(entry).toMatchObject({ subject: 'unknown', channelName: 'chan' });
  });

  it('reads AUDIT_ACTION_KEY metadata off the handler via the Reflector', () => {
    const { reflector, getSpy } = createReflectorStubWithSpy('upload');
    const interceptor = new AuditLoggingInterceptor(reflector);
    const handlerRef = {};
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ params: {}, user: undefined }),
      }),
      getHandler: () => handlerRef,
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    interceptor.intercept(context, createHandler(of(null)));

    expect(getSpy).toHaveBeenCalledWith(AUDIT_ACTION_KEY, handlerRef);
  });
});
