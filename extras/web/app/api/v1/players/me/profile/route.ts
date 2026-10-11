// PUT /api/v1/players/me/profile { avatar_source } — which picture to show. Install key only.
import { ref } from '@/lib/engine';
import { bearer, privateJson, readJson, route } from '@/lib/http';
import { take } from '@/lib/ratelimit';
import { getStore } from '@/lib/store';
import { validateProfile } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export const PUT = route(async (req: Request) => {
  const store = getStore();
  const player = await store.authenticate(bearer(req));
  take(`avatar:${player.id}`, 15, 0.2);
  const { avatar_source } = validateProfile(await readJson(req));
  await store.setAvatarSource(player, avatar_source);
  const snap = await store.snapshot();
  return privateJson({ player: ref(snap, snap.byHandle.get(player.handle)!), avatar_source });
});
