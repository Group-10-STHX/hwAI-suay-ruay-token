// GET /api/v1/avatars/:playerId — public profile photo.
import { ApiError } from '@/lib/errors';
import { imageResponse, route } from '@/lib/http';
import { getStore } from '@/lib/store';
import { UUID } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new ApiError(404, 'not_found', 'no such avatar');
  const hit = await getStore().getAvatar(id.toLowerCase());
  if (!hit) throw new ApiError(404, 'not_found', 'no such avatar');
  return imageResponse(hit.bytes, hit.mime);
});
