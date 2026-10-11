// POST/DELETE /api/v1/wais/:id/sticker — transparent PNG cut-out for one wai. Install key only.
import { ApiError } from '@/lib/errors';
import { bearer, contentType, privateJson, readBytes, route } from '@/lib/http';
import { MAX_STICKER_BYTES, checkImage } from '@/lib/image';
import { take } from '@/lib/ratelimit';
import { getStore } from '@/lib/store';
import { UUID } from '@/lib/validate';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

async function waiId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new ApiError(404, 'not_found', 'no such wai');
  return id.toLowerCase();
}

export const POST = route(async (req: Request, ctx: Ctx) => {
  const key = bearer(req);
  const store = getStore();
  const player = await store.authenticate(key);
  take(`sticker:${player.id}`, 20, 2);
  take(`sticker-day:${player.id}`, 1000, 1000 / 86_400);
  if (contentType(req) !== 'image/png') throw new ApiError(415, 'unsupported_media', 'Content-Type must be image/png');
  const bytes = await readBytes(req, MAX_STICKER_BYTES);
  checkImage(bytes, ['image/png']);
  const id = await waiId(ctx);
  const v = await store.putSticker(player, id, bytes);
  return privateJson({ sticker_url: `/api/v1/stickers/${id}.png?v=${v}` });
});

export const DELETE = route(async (req: Request, ctx: Ctx) => {
  const store = getStore();
  const player = await store.authenticate(bearer(req));
  take(`sticker:${player.id}`, 20, 2);
  return privateJson({ deleted: await store.deleteSticker(player, await waiId(ctx)) });
});
