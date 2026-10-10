// POST /api/v1/wais/batch — up to 100 attempts (outbox flush). Per-item results, always HTTP 200.
import { ApiError } from '@/lib/errors';
import { bearer, privateJson, readJson, route } from '@/lib/http';
import { take } from '@/lib/ratelimit';
import { getStore } from '@/lib/store';
import type { InsertResult } from '@/lib/store/types';
import type { WaiSubmission } from '@/lib/types';
import { validateWai } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export const POST = route(async (req: Request) => {
  const store = getStore();
  const player = await store.authenticate(bearer(req));
  take(`wai:${player.id}`, 10, 2);
  const body = (await readJson(req, 256 * 1024)) as { items?: unknown };
  if (!body || !Array.isArray(body.items)) throw new ApiError(400, 'invalid_body', 'body must be { "items": [...] }', 'items');
  if (body.items.length > 100) throw new ApiError(400, 'invalid_body', 'at most 100 items per batch', 'items');
  take(`wai-day:${player.id}`, 3000, 3000 / 86_400);

  const results: (InsertResult | null)[] = [];
  const valid: { i: number; w: WaiSubmission }[] = [];
  body.items.forEach((item, i) => {
    try {
      valid.push({ i, w: validateWai(item) });
      results.push(null);
    } catch (e) {
      const err = e as ApiError;
      const id = typeof (item as { id?: unknown })?.id === 'string' ? (item as { id: string }).id : '';
      results.push({ id, status: 400, error: { code: err.code, message: err.message, field: err.field } });
    }
  });
  const inserted = await store.insertWais(player, valid.map((v) => v.w));
  valid.forEach((v, k) => { results[v.i] = inserted[k]; });
  return privateJson({ results });
});
