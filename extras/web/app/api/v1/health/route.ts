import { privateJson, route } from '@/lib/http';
import { current } from '@/lib/service';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const { store, snap, now } = await current();
  return privateJson({ ok: true, store: store.kind, players: snap.players.length, wais: snap.wais.length, time: new Date(now).toISOString() });
});
