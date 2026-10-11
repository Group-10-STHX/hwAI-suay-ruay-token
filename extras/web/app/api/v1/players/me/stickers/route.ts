// DELETE /api/v1/players/me/stickers — remove every sticker of the key's player (privacy).
import { bearer, privateJson, route } from '@/lib/http';
import { take } from '@/lib/ratelimit';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

export const DELETE = route(async (req: Request) => {
  const store = getStore();
  const player = await store.authenticate(bearer(req));
  take(`sticker:${player.id}`, 20, 2);
  return privateJson({ deleted: await store.deleteAllStickers(player) });
});
