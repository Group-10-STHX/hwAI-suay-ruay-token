import Link from 'next/link';
import type { Leaderboard, Metric, Period } from '@/lib/types';
import { METRICS, PERIODS } from '@/lib/types';
import { METRIC_LABEL, PERIOD_LABEL, UNIT_LABEL, dShort, fmt, fmtValue } from '@/lib/format';
import { Avatar, Delta, Hud, LevelPill, Reticle } from './bits';

const href = (m: Metric, p: Period) => `/?metric=${m}&period=${p}`;

export function Board({ data, interactive = true }: { data: Leaderboard; interactive?: boolean }) {
  const label = METRIC_LABEL[data.metric];
  const allTime = data.metric === 'streak' || !data.range.from;
  const range = allTime ? 'ตลอดกาล' : `${dShort.format(new Date(data.range.from!))} – ${dShort.format(new Date(data.range.to))}`;
  const showDelta = !allTime && data.period !== 'all';
  const top = data.entries.slice(0, 3), rest = data.entries.slice(3);
  const unit = data.entries[0] ? UNIT_LABEL[data.entries[0].unit] : '';
  const shownPeriod: Period = data.metric === 'streak' ? 'all' : data.period;

  return (
    <Hud className="area-board" id="board-title" code={`// RANKING :: ${label.code}`} title={label.th}
      sub={`${label.desc} · ${range} · ${fmt(data.total)} คน`}>
      {interactive ? (
        <>
          <nav className="scroller" aria-label="ประเภทอันดับ">
            <div className="tabs">
              {METRICS.map((m) => (
                <Link key={m} className="tab" href={href(m, data.period)} scroll={false} aria-current={m === data.metric ? 'page' : undefined}>
                  {METRIC_LABEL[m].th}<small>{METRIC_LABEL[m].code}</small>
                </Link>
              ))}
            </div>
          </nav>
          <nav className="seg" aria-label="ช่วงเวลา">
            {PERIODS.map((p) =>
              data.metric === 'streak' && p !== 'all'
                ? <span key={p} className="off" aria-disabled="true">{PERIOD_LABEL[p]}</span>
                : <Link key={p} href={href(data.metric, p)} scroll={false} aria-current={p === shownPeriod ? 'page' : undefined}>{PERIOD_LABEL[p]}</Link>)}
          </nav>
        </>
      ) : null}

      {!data.entries.length ? (
        <div className="empty">
          {data.metric === 'shame'
            ? <><b>😇</b>ยังไม่มีมนุษย์คนไหนทำ AI งอนจนเลิกคุย</>
            : <><b>🙏</b>ช่วงนี้ยังไม่มีใครไหว้ ไปไหว้ซะ ก่อนจะสาย</>}
        </div>
      ) : (
        <>
          <div className="podium">
            {top.map((e) => (
              <Link key={e.player.id} href={`/players/${e.player.handle}`} className={`pod pod-${Math.min(e.rank, 3)}`}>
                <span className="pod-rank">RANK #{e.rank}</span>
                <span className="pod-target"><Reticle /><Avatar p={e.player} size="l" /></span>
                <span className="pod-name">{e.player.display_name}</span>
                <span className="pod-value num">{fmtValue(e.value, e.unit)}<small>{unit}</small></span>
                {e.best ? <LevelPill level={e.best.level} /> : null}
              </Link>
            ))}
          </div>
          <ol className="rows">
            {rest.map((e) => (
              <li key={e.player.id}>
                <Link className="row" href={`/players/${e.player.handle}`}>
                  <span className="rank">{String(e.rank).padStart(2, '0')}</span>
                  <Avatar p={e.player} />
                  <span className="who">
                    <b>{e.player.display_name}</b>
                    <span>@{e.player.handle}{data.metric === 'survival' ? ` · ไหว้สวย ${e.stats.beautiful}/${e.stats.attempts}` : ''}</span>
                    {data.metric === 'survival' ? <span className="meter" style={{ ['--v' as string]: e.value }}><i /></span> : null}
                  </span>
                  {e.best ? <LevelPill level={e.best.level} /> : <span />}
                  <span className="val num">{fmtValue(e.value, e.unit)}<small>{unit}</small></span>
                  <Delta d={e.delta_rank} show={showDelta} />
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </Hud>
  );
}
