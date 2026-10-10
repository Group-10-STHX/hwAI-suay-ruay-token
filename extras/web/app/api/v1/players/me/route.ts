// GET/PATCH /api/v1/players/me — the player that owns the install key.
import { bearer, privateJson, readJson, route } from '@/lib/http';
import { getStore } from '@/lib/store';
import { validatePatch } from '@/lib/validate';

export const dynamic = 'force-dynamic';

const pub = ({ id, handle, display_name, avatar_hue }: { id: string; handle: string; display_name: string; avatar_hue: number }) =>
  ({ id, handle, display_name, avatar_hue });

export const GET = route(async (req: Request) => {
  const player = await getStore().authenticate(bearer(req));
  return privateJson({ player: pub(player) });
});

export const PATCH = route(async (req: Request) => {
  const store = getStore();
  const player = await store.authenticate(bearer(req));
  const updated = await store.updatePlayer(player.id, validatePatch(await readJson(req)));
  return privateJson({ player: pub(updated) });
});
