// GET /api/v1/stickers/:waiId.png — public. (.svg exists only for simulated mock players.)
import { ApiError } from '@/lib/errors';
import { imageResponse, route } from '@/lib/http';
import { getStore } from '@/lib/store';
import { UUID } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req: Request, ctx: { params: Promise<{ file: string }> }) => {
  const m = /^(.+)\.(png|svg)$/.exec((await ctx.params).file);
  if (!m || !UUID.test(m[1])) throw new ApiError(404, 'not_found', 'no such sticker');
  const hit = await getStore().getSticker(m[1].toLowerCase());
  if (!hit || (m[2] === 'png') !== (hit.mime === 'image/png')) throw new ApiError(404, 'not_found', 'no such sticker');
  return imageResponse(hit.bytes, hit.mime);
});
