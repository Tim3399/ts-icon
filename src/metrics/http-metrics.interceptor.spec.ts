import { EventEmitter } from 'events';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import type { Request, Response } from 'express';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import type { MetricsService } from './metrics.service';

function createMetricsStub(): {
  metrics: MetricsService;
  incMock: jest.Mock;
  observeMock: jest.Mock;
} {
  const incMock = jest.fn();
  const observeMock = jest.fn();
  const metrics = {
    httpRequestsTotal: { inc: incMock },
    httpRequestDurationSeconds: { observe: observeMock },
  } as unknown as MetricsService;
  return { metrics, incMock, observeMock };
}

/** A response stub that's also a real EventEmitter, so `res.once('finish', ...)` works. */
function createRes(statusCode: number): Response {
  const res = new EventEmitter() as unknown as Response;
  (res as unknown as { statusCode: number }).statusCode = statusCode;
  return res;
}

function createContext(req: Partial<Request>, res: Response): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => req as Request,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

function createHandler(observable = of('ok')): CallHandler {
  return { handle: () => observable } as CallHandler;
}

describe('HttpMetricsInterceptor', () => {
  it('records method/route/status once the response finishes, using the route template', () => {
    const { metrics, incMock, observeMock } = createMetricsStub();
    const interceptor = new HttpMetricsInterceptor(metrics);
    const res = createRes(200);
    const req = {
      method: 'GET',
      route: { path: '/images/:channelName' },
    } as unknown as Request;
    const context = createContext(req, res);

    interceptor.intercept(context, createHandler()).subscribe();
    expect(incMock).not.toHaveBeenCalled(); // not yet -- response hasn't "finished"
    res.emit('finish');

    expect(incMock).toHaveBeenCalledWith({
      method: 'GET',
      route: '/images/:channelName',
      status: '200',
    });
    expect(observeMock).toHaveBeenCalledWith(
      { method: 'GET', route: '/images/:channelName', status: '200' },
      expect.any(Number),
    );
  });

  it('labels a request that never matched any route as "unmatched", not the raw URL', () => {
    const { metrics, incMock } = createMetricsStub();
    const interceptor = new HttpMetricsInterceptor(metrics);
    const res = createRes(404);
    const req = { method: 'GET', originalUrl: '/some/probing/path' } as Request;
    const context = createContext(req, res);

    interceptor.intercept(context, createHandler()).subscribe();
    res.emit('finish');

    expect(incMock).toHaveBeenCalledWith({
      method: 'GET',
      route: 'unmatched',
      status: '404',
    });
  });

  it('still records the final status after the handler throws (status set by the exception filter before "finish")', () => {
    const { metrics, incMock } = createMetricsStub();
    const interceptor = new HttpMetricsInterceptor(metrics);
    const res = createRes(200); // starts as 200; the (simulated) exception filter changes it before "finish"
    const req = {
      method: 'POST',
      route: { path: '/images-local/from-url' },
    } as unknown as Request;
    const context = createContext(req, res);

    interceptor
      .intercept(context, createHandler(throwError(() => new Error('boom'))))
      .subscribe({ error: () => undefined });
    (res as unknown as { statusCode: number }).statusCode = 400;
    res.emit('finish');

    expect(incMock).toHaveBeenCalledWith({
      method: 'POST',
      route: '/images-local/from-url',
      status: '400',
    });
  });
});
