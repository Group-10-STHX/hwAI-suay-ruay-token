// Server-rendered extras that only the preview themes show (app/themes/*.css, `?theme=arcade|book|news`).
// The default HUD theme hides all of it (app/themes/base.css), and hidden lazy images are never fetched.
import Link from 'next/link';
import type { FeedItem, LeaderboardEntry } from '@/lib/types';
import { LEVEL_LABEL, fmtValue } from '@/lib/format';
import { Sticker } from './bits';

const dFull = new Intl.DateTimeFormat('th-TH', { dateStyle: 'full', timeZone: 'Asia/Bangkok' });

/** [css class, Thai status (newsroom), arcade call-out]. */
function tag(it: FeedItem): [string, string, string] {
  if (it.forgave) return ['ok', 'ง้อสำเร็จ', 'COMBO!'];
  if (it.beautiful) return ['hot', 'ไหว้สวย', 'PERFECT!'];
  if (it.passed) return ['ok', 'ผ่าน', 'CLEAR'];
  if (it.action === 'retry') return ['warn', 'ไม่สวย', 'MISS'];
  if (it.action === 'deny') return ['bad', 'AI งอน', 'GUARD'];
  return ['bad', 'เลิกคุย', 'K.O.'];
}

/** Dateline (newsroom masthead) + a marquee of the live feed (arcade ticker / newsroom ข่าวด่วน crawl). Decorative:
 *  the accessible live list is still `LiveFeed`. Re-rendered by the same `router.refresh()` that updates the boards. */
export function ThemeStrip({ items, now }: { items: FeedItem[]; now: number }) {
  const run = (k: string) => items.map((it) => {
    const [cls, th, en] = tag(it);
    return (
      <span key={k + it.id} className={`lm-${cls}`}>
        <b>{it.player.display_name}</b> {LEVEL_LABEL[it.level]} {it.score} คะแนน <i>{th}</i><em>{en}</em>
      </span>
    );
  });
  return (
    <div className="theme-strip" aria-hidden="true">
      <p className="dateline"><span>ฉบับ{dFull.format(now)}</span><span>ราคา 1 ไหว้ · ข่าวสดจากเครือข่าย AI</span></p>
      {items.length ? (
        <div className="live-marquee">
          <span className="lm-label"><span className="t-arcade">LIVE</span><span className="t-news">ข่าวด่วน</span></span>
          <div className="lm-viewport"><div className="lm-track">{run('a')}{run('b')}</div></div>
        </div>
      ) : null}
    </div>
  );
}

/** Today's best sticker: arcade "PLAYER 1" portrait, sticker-book "สติกเกอร์แห่งวัน", newsroom "ภาพข่าวประจำวัน". */
export function HeroSticker({ e }: { e: LeaderboardEntry | undefined }) {
  if (!e?.sticker_url) return null;
  return (
    <Link className="hero-stk" href={`/players/${e.player.handle}`}>
      <span className="hero-stk-k" aria-hidden="true">
        <span className="t-arcade">PLAYER 1</span><span className="t-book">สติกเกอร์แห่งวัน</span><span className="t-news">ภาพข่าวประจำวัน</span>
      </span>
      <span className="hero-stk-img"><Sticker url={e.sticker_url} size={240} alt={`sticker ไหว้ของ ${e.player.display_name}`} /></span>
      <span className="hero-stk-cap"><b>{e.player.display_name}</b> ไหว้สวยที่สุด {fmtValue(e.value, e.unit)} คะแนน</span>
    </Link>
  );
}
