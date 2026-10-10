// In-memory token buckets. Per server instance — good enough for one Node process / a hackathon.
import { ApiError } from './errors';

const buckets = new Map<string, { tokens: number; at: number }>();

/** Allow `burst` requests, refilling `perSec` tokens per second. Throws 429 when empty. */
export function take(key: string, burst: number, perSec: number, now = Date.now()) {
  const b = buckets.get(key) ?? { tokens: burst, at: now };
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * perSec);
  b.at = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    const retry = Math.ceil((1 - b.tokens) / perSec);
    throw new ApiError(429, 'rate_limited', 'slow down', undefined, { 'Retry-After': String(retry) });
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 10_000) buckets.clear(); // crude bound on memory
}
