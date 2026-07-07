import { Request, Response, NextFunction } from 'express';

type RateLimitWindow = {
  count: number;
  resetAt: number;
};

export type RateLimitOptions = {
  maxRequests: number;
  windowMs: number;
  keyGenerator: (req: Request) => string;
};

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function sweepExpiredEntries(
  store: Map<string, RateLimitWindow>,
  now: number,
): void {
  for (const [key, window] of store) {
    if (now >= window.resetAt) {
      store.delete(key);
    }
  }
}

export function createRateLimitMiddleware(options: RateLimitOptions) {
  const { maxRequests, windowMs, keyGenerator } = options;
  const store = new Map<string, RateLimitWindow>();

  const sweepTimer = setInterval(
    () => sweepExpiredEntries(store, Date.now()),
    SWEEP_INTERVAL_MS,
  );
  sweepTimer.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = keyGenerator(req);

    let window = store.get(key);
    if (!window || now >= window.resetAt) {
      window = { count: 0, resetAt: now + windowMs };
    }

    window.count += 1;
    store.set(key, window);

    if (window.count > maxRequests) {
      const retryAfter = Math.max(
        1,
        Math.ceil((window.resetAt - now) / 1000),
      );
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        statusCode: 429,
        message: 'Too many requests. Please try again later.',
        retryAfter,
      });
      return;
    }

    next();
  };
}
