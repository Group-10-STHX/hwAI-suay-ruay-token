import { hallOfFame } from '@/lib/engine';
import { publicJson, route } from '@/lib/http';
import { current } from '@/lib/service';

export const dynamic = 'force-dynamic';

export const GET = route(async (req: Request) => {
  const { snap, now } = await current();
  return publicJson(hallOfFame(snap, new URL(req.url).searchParams.get('weeks'), now), 60);
});
