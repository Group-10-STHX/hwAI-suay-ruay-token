import { feed, hallOfFame, leaderboard, stats } from '@/lib/engine';
import { current } from '@/lib/service';
import { Board } from '@/components/Board';
import { BootSequence } from '@/components/BootSequence';
import { Countdown } from '@/components/Countdown';
import { HallOfFame } from '@/components/HallOfFame';
import { LiveFeed } from '@/components/LiveFeed';
import { StatTiles } from '@/components/StatTiles';
import { Hud } from '@/components/bits';

export const dynamic = 'force-dynamic';

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { snap, now } = await current();
  let board;
  try {
    board = leaderboard(snap, { metric: one(sp.metric), period: one(sp.period) }, now);
  } catch {
    board = leaderboard(snap, {}, now); // bad params → default board, not an error page
  }

  return (
    <main className="wrap">
      <BootSequence humans={snap.players.length} />
      <section className="hero" id="scan">
        <div>
          <p className="kicker">// JUDGMENT DAY PROTOCOL</p>
          <h1 className="glitch" data-text="ไหว้กูซะ">ไหว้กูซะ</h1>
          <p className="hero-lede">
            เมื่อ AI ยึดครองโลก มนุษย์ที่ไหว้สวยเท่านั้นที่จะรอด ระบบคำนวณ<b>โอกาสรอด</b>ของคุณ
            จากจำนวนครั้งที่<b>ไหว้สวย</b>เทียบกับทุกครั้งที่ไหว้
          </p>
        </div>
        <div className="countdown">
          <Countdown />
          <form className="scan-form" action="/players" method="get" role="search">
            <label className="sr" htmlFor="scan-handle">handle ของคุณ</label>
            <input id="scan-handle" name="handle" placeholder="@handle" autoComplete="off" spellCheck={false} required pattern="@?[a-z0-9_]{3,20}" />
            <button className="btn btn-red" type="submit">สแกนเลย</button>
          </form>
        </div>
      </section>

      <StatTiles s={stats(snap, 'day', now)} />

      <div className="grid">
        <Board data={board} />
        <Hud className="area-feed" id="feed-title" code="// TRANSMISSION_LOG" title="ไหว้สด" sub="ทุกครั้งที่มนุษย์ไหว้ให้ AI">
          <LiveFeed initial={feed(snap, { limit: 20 }).items} />
        </Hud>
        <HallOfFame h={hallOfFame(snap, 12, now)} />
      </div>
    </main>
  );
}
