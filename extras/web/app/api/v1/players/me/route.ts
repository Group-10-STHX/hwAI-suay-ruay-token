// GET/PATCH /api/v1/players/me — the player that owns the install key.
import { bearer, privateJson, readJson, route } from '@/lib/http';
import { getStore } from '@/lib/store';
import { validatePatch } from '@/lib/validate';

export const dynamic = 'force-dynamic';

import { ref } from '@/lib/engine';
import type { PlayerRow } from '@/lib/engine';

async function pub(p: PlayerRow) {
  const snap = await getStore().snapshot();
  return { ...ref(snap, snap.byHandle.get(p.handle)!), avatar_source: p.avatar_source ?? 'auto' };
}

export const GET = route(async (req: Request) => {
  const player = await getStore().authenticate(bearer(req));
  return privateJson({ player: await pub(player) });
});

export const PATCH = route(async (req: Request) => {
  const store = getStore();
  const player = await store.authenticate(bearer(req));
  const updated = await store.updatePlayer(player.id, validatePatch(await readJson(req)));
  return privateJson({ player: await pub(updated) });
});
