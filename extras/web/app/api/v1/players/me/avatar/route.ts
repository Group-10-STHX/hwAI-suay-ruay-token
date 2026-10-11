// PUT/DELETE /api/v1/players/me/avatar — profile photo (png|jpeg|webp, ≤ 250 KB). Install key only.
import { ref } from '@/lib/engine';
import { ApiError } from '@/lib/errors';
import { bearer, contentType, privateJson, readBytes, route } from '@/lib/http';
import { AVATAR_MIMES, MAX_AVATAR_BYTES, checkImage } from '@/lib/image';
import { take } from '@/lib/ratelimit';
import { getStore } from '@/lib/store';

export const dynamic = 'force-dynamic';

async function result(handle: string) {
  const snap = await getStore().snapshot();
  const pi = snap.byHandle.get(handle)!;
  const r = ref(snap, pi);
  return { avatar_url: r.avatar_url, avatar_kind: r.avatar_kind, avatar_source: snap.players[pi].avatar_source ?? 'auto' };
}

export const PUT = route(async (req: Request) => {
  const store = getStore();
  const player = await store.authenticate(bearer(req));
  take(`avatar:${player.id}`, 15, 0.2);
  const ct = contentType(req);
  if (!(AVATAR_MIMES as readonly string[]).includes(ct)) throw new ApiError(415, 'unsupported_media', 'Content-Type must be image/png, image/jpeg or image/webp');
  const bytes = await readBytes(req, MAX_AVATAR_BYTES);
  const mime = checkImage(bytes, AVATAR_MIMES);
  if (mime !== ct) throw new ApiError(415, 'unsupported_media', `body is ${mime}, Content-Type says ${ct}`);
  await store.putAvatar(player, bytes, mime);
  return privateJson(await result(player.handle));
});

export const DELETE = route(async (req: Request) => {
  const store = getStore();
  const player = await store.authenticate(bearer(req));
  take(`avatar:${player.id}`, 15, 0.2);
  await store.deleteAvatar(player);
  return privateJson(await result(player.handle));
});
