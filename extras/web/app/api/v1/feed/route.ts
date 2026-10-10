import { feed } from '@/lib/engine';
import { publicJson, route } from '@/lib/http';
import { current } from '@/lib/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (req: Request) => {
  const q = new URL(req.url).searchParams;
  const { snap } = await current();
  return publicJson(feed(snap, { limit: q.get('limit'), before: q.get('before'), after: q.get('after') }), 5);
});
