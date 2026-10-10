import { ApiError } from './errors';
import type { ApiErrorBody } from './types';

const CORS = { 'Access-Control-Allow-Origin': '*' };

/** Public, cacheable GET response. */
export function publicJson(data: unknown, maxAge = 15) {
  return Response.json(data, {
    headers: { ...CORS, 'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=60` },
  });
}

export function privateJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) {
    const body: ApiErrorBody = { error: { code: e.code, message: e.message, ...(e.field ? { field: e.field } : {}) } };
    return Response.json(body, { status: e.status, headers: { ...CORS, 'Cache-Control': 'no-store', ...e.headers } });
  }
  console.error(e);
  return Response.json({ error: { code: 'internal', message: 'internal error' } } satisfies ApiErrorBody, { status: 500, headers: CORS });
}

/** Wrap a route handler so ApiErrors become the documented error JSON. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, 'too_large', `body larger than ${maxBytes} bytes`);
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'invalid_body', 'body is not valid JSON');
  }
}

export function bearer(req: Request): string {
  const h = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(wai_sk_[0-9a-f]{48})$/.exec(h.trim());
  if (!m) throw new ApiError(401, 'unauthorized', 'missing or malformed Authorization: Bearer wai_sk_…');
  return m[1];
}

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
}
