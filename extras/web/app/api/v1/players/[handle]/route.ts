import { profile } from '@/lib/engine';
import { publicJson, route } from '@/lib/http';
import { current } from '@/lib/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (_req: Request, ctx: { params: Promise<{ handle: string }> }) => {
  const { handle } = await ctx.params;
  const { snap, now } = await current();
  return publicJson(profile(snap, handle, now));
});
