import { leaderboard } from '@/lib/engine';
import { publicJson, route } from '@/lib/http';
import { current } from '@/lib/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const { snap, now } = await current();
  return publicJson(leaderboard(snap, { metric: q.get('metric'), period: q.get('period'), limit: q.get('limit'), offset: q.get('offset') }, now));
});
