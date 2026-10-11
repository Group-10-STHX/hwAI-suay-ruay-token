import type { Metadata } from 'next';
import { feed, leaderboard, stats } from '@/lib/engine';
import { current } from '@/lib/service';
import type { Metric, Period } from '@/lib/types';
import { LiveFeed } from '@/components/LiveFeed';
import { StatTiles } from '@/components/StatTiles';
import { TvRotator } from '@/components/TvRotator';
import { TvSticker } from '@/components/TvSticker';
import { Hud } from '@/components/bits';
import { ThemeStrip } from '@/components/ThemeBits';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'จอใหญ่' };

const ROTATION: [Metric, Period][] = [
  ['survival', 'all'], ['beauty', 'day'], ['count', 'day'], ['survival', 'week'],
  ['lv3', 'week'], ['streak', 'all'], ['shame', 'week'], ['beauty', 'all'],
];

export default async function Tv() {
  const { snap, now } = await current();
  const recent = feed(snap, { limit: 14 }).items;
  const boards = ROTATION.map(([metric, period]) => leaderboard(snap, { metric, period, limit: 10 }, now));
  return (
    <main className="wrap" style={{ maxWidth: 'none' }}>
      <ThemeStrip items={recent.slice(0, 12)} now={now} />
      <StatTiles s={stats(snap, 'day', now)} />
      <div className="tv-stage">
        <TvRotator boards={boards} />
        <Hud id="tv-feed" code="// TRANSMISSION_LOG" title="ไหว้สด">
          <LiveFeed initial={recent} refresh={false} />
        </Hud>
      </div>
      <TvSticker initialIds={recent.filter((i) => i.sticker_url).map((i) => i.id)} />
    </main>
  );
}
