import { stats } from '@/lib/engine';
import { publicJson, route } from '@/lib/http';
import { current } from '@/lib/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (req: Request) => {
  const { snap, now } = await current();
  return publicJson(stats(snap, new URL(req.url).searchParams.get('period'), now));
});
