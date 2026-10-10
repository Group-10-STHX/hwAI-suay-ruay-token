import type { Metadata } from 'next';
import { feed, leaderboard, stats } from '@/lib/engine';
import { current } from '@/lib/service';
import type { Metric, Period } from '@/lib/types';
import { LiveFeed } from '@/components/LiveFeed';
import { StatTiles } from '@/components/StatTiles';
import { TvRotator } from '@/components/TvRotator';
import { Hud } from '@/components/bits';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'จอใหญ่' };

const ROTATION: [Metric, Period][] = [
  ['survival', 'all'], ['beauty', 'day'], ['count', 'day'], ['survival', 'week'],
  ['lv3', 'week'], ['streak', 'all'], ['shame', 'week'], ['beauty', 'all'],
];

export default async function Tv() {
  const { snap, now } = await current();
  const boards = ROTATION.map(([metric, period]) => leaderboard(snap, { metric, period, limit: 10 }, now));
  return (
    <main className="wrap" style={{ maxWidth: 'none' }}>
      <StatTiles s={stats(snap, 'day', now)} />
      <div className="tv-stage">
        <TvRotator boards={boards} />
        <Hud id="tv-feed" code="// TRANSMISSION_LOG" title="ไหว้สด">
          <LiveFeed initial={feed(snap, { limit: 14 }).items} refresh={false} />
        </Hud>
      </div>
    </main>
  );
}
