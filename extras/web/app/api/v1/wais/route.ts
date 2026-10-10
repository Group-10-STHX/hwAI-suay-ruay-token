// POST /api/v1/wais — one resolved attempt from the daemon. Idempotent by `id`.
import { ApiError } from '@/lib/errors';
import { bearer, privateJson, readJson, route } from '@/lib/http';
import { take } from '@/lib/ratelimit';
import { getStore } from '@/lib/store';
import { validateWai } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export const POST = route(async (req: Request) => {
  const key = bearer(req);
  const store = getStore();
  const player = await store.authenticate(key);
  take(`wai:${player.id}`, 10, 2);
  take(`wai-day:${player.id}`, 3000, 3000 / 86_400);
  const [r] = await store.insertWais(player, [validateWai(await readJson(req))]);
  if (r.status === 409) throw new ApiError(409, 'duplicate', 'same id with a different body', 'id');
  return privateJson({ id: r.id, created_at: r.created_at }, r.status);
});
