import { NextFunction, Request, Response } from 'express';
import { createRateLimitMiddleware } from './rate-limit.middleware';

function createMocks() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const setHeader = jest.fn();
  const res = { status, json, setHeader } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { res, next, status, json, setHeader };
}

describe('createRateLimitMiddleware', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('allows requests below the limit', () => {
    const middleware = createRateLimitMiddleware({
      maxRequests: 3,
      windowMs: 60_000,
      keyGenerator: () => 'test:ip:127.0.0.1',
    });
    const { res, next } = createMocks();

    for (let i = 0; i < 3; i++) {
      middleware({} as Request, res, next);
    }

    expect(next).toHaveBeenCalledTimes(3);
    expect(statusMock(res)).not.toHaveBeenCalled();
  });

  it('returns 429 when the limit is exceeded', () => {
    const middleware = createRateLimitMiddleware({
      maxRequests: 2,
      windowMs: 60_000,
      keyGenerator: () => 'test:ip:127.0.0.1',
    });
    const { res, next, status, json, setHeader } = createMocks();

    middleware({} as Request, res, next);
    middleware({} as Request, res, next);
    middleware({} as Request, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenCalledWith(429);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(json).toHaveBeenCalledWith({
      statusCode: 429,
      message: 'Too many requests. Please try again later.',
      retryAfter: expect.any(Number),
    });
  });

  it('allows requests again after the window expires', () => {
    jest.useFakeTimers();

    const middleware = createRateLimitMiddleware({
      maxRequests: 2,
      windowMs: 1_000,
      keyGenerator: () => 'test:window',
    });
    const { res, next, status } = createMocks();

    middleware({} as Request, res, next);
    middleware({} as Request, res, next);
    middleware({} as Request, res, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenCalledWith(429);

    jest.advanceTimersByTime(1_001);

    (next as jest.Mock).mockClear();
    status.mockClear();

    middleware({} as Request, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('limits separately per identifier key', () => {
    const middleware = createRateLimitMiddleware({
      maxRequests: 2,
      windowMs: 60_000,
      keyGenerator: (req) => `auth:login:id:${req.body?.identifier ?? ''}`,
    });
    const { res, next, status } = createMocks();

    const reqA = { body: { identifier: 'a@test.com' } } as Request;
    const reqB = { body: { identifier: 'b@test.com' } } as Request;

    middleware(reqA, res, next);
    middleware(reqA, res, next);
    middleware(reqB, res, next);

    expect(next).toHaveBeenCalledTimes(3);
    expect(status).not.toHaveBeenCalled();

    middleware(reqA, res, next);
    expect(next).toHaveBeenCalledTimes(3);
    expect(status).toHaveBeenCalledWith(429);
  });
});

function statusMock(res: Response) {
  return (res as unknown as { status: jest.Mock }).status;
}
