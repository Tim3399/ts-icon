import type { NextFunction, Request, Response } from 'express';
import { requestIdMiddleware } from './request-id.middleware';
import { getRequestId } from './request-context';

function createRequest(
  headers: Record<string, string | string[] | undefined>,
): Request {
  return { headers } as unknown as Request;
}

function createResponse(): Response & { setHeader: jest.Mock } {
  return { setHeader: jest.fn() } as unknown as Response & {
    setHeader: jest.Mock;
  };
}

describe('requestIdMiddleware', () => {
  it('reuses an incoming X-Request-Id header instead of generating a new one', () => {
    const req = createRequest({ 'x-request-id': 'incoming-id' });
    const res = createResponse();
    const next = jest.fn();

    requestIdMiddleware(req, res, next as unknown as NextFunction);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'incoming-id');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates a fresh id and echoes it on the response when no header is present', () => {
    const req = createRequest({});
    const res = createResponse();
    const next = jest.fn();

    requestIdMiddleware(req, res, next as unknown as NextFunction);

    expect(res.setHeader).toHaveBeenCalledTimes(1);
    const [headerName, generatedId] = res.setHeader.mock.calls[0] as [
      string,
      string,
    ];
    expect(headerName).toBe('X-Request-Id');
    expect(typeof generatedId).toBe('string');
    expect(generatedId.length).toBeGreaterThan(0);
  });

  it('makes the request id available via getRequestId for the duration of next()', () => {
    const req = createRequest({ 'x-request-id': 'ctx-check-id' });
    const res = createResponse();
    let seenDuringNext: string | undefined;
    const next: NextFunction = () => {
      seenDuringNext = getRequestId();
    };

    requestIdMiddleware(req, res, next);

    expect(seenDuringNext).toBe('ctx-check-id');
    // Outside of the middleware's call to next(), there's no active context.
    expect(getRequestId()).toBeUndefined();
  });

  it('ignores a blank incoming header and generates a new id instead', () => {
    const req = createRequest({ 'x-request-id': '   ' });
    const res = createResponse();
    const next = jest.fn();

    requestIdMiddleware(req, res, next as unknown as NextFunction);

    const [, generatedId] = res.setHeader.mock.calls[0] as [string, string];
    expect(generatedId.trim()).not.toBe('');
    expect(generatedId).not.toBe('   ');
  });
});
