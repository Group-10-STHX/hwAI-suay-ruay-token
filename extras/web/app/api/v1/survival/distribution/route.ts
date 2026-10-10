import { distribution } from '@/lib/engine';
import { publicJson, route } from '@/lib/http';
import { current } from '@/lib/service';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const { snap } = await current();
  return publicJson(distribution(snap), 30);
});
