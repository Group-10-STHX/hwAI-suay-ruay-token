// POST /api/v1/players — register a handle; returns the install key ONCE.
import { clientIp, privateJson, readJson, route } from '@/lib/http';
import { take } from '@/lib/ratelimit';
import { getStore } from '@/lib/store';
import { validateRegister } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export const POST = route(async (req: Request) => {
  take(`register:${clientIp(req)}`, 5, 5 / 3600);
  const body = validateRegister(await readJson(req));
  const { player, install_key } = await getStore().register(body.handle, body.display_name);
  const { id, handle, display_name, avatar_hue } = player;
  return privateJson({ player: { id, handle, display_name, avatar_hue, avatar_url: null, avatar_kind: 'generated' }, install_key }, 201);
});
