import Link from 'next/link';
import type { HallOfFame as Hof } from '@/lib/types';
import { RECORD_ICON, SHAME_RECORDS, UNIT_LABEL, dLong, dShort, fmtValue } from '@/lib/format';
import { Avatar, Hud, LevelPill } from './bits';

export function HallOfFame({ h }: { h: Hof }) {
  return (
    <Hud className="area-hof" id="hof-title" code="// ARCHIVE :: HUMANS_OF_RECORD" title="Hall of Fame" sub="สถิติตลอดกาลที่ AI จดจำไว้">
      <div className="records">
        {h.records.map((r) => (
          <Link key={r.key} href={`/players/${r.player.handle}`} className={`rec${SHAME_RECORDS.has(r.key) ? ' rec-shame' : ''}`}>
            <span className="rec-icon" aria-hidden="true">{RECORD_ICON[r.key] ?? '⭐'}</span>
            <span className="rec-title">{r.title}</span>
            <span className="rec-value num">
              {r.key === 'perfect_100' ? 'คนแรก' : <>{fmtValue(r.value, r.unit)}<small>{UNIT_LABEL[r.unit]}</small></>}
            </span>
            <span className="rec-who">
              <Avatar p={r.player} size="s" /><b>{r.player.display_name}</b>
              <span className="rec-date">{r.achieved_at ? dLong.format(new Date(r.achieved_at)) : 'ปัจจุบัน'}</span>
            </span>
          </Link>
        ))}
      </div>
      <h3 className="sub-title">ไหว้ดีเด่นประจำสัปดาห์ <span className="hud-code">WEEKLY_CHAMPION</span></h3>
      <div className="scroller">
        <ol className="champs">
          {h.champions.map((c) => (
            <li key={c.week}>
              <Link className="champ" href={`/players/${c.player.handle}`}>
                <span className="champ-wk">W{c.week.split('-W')[1]} · {dShort.format(new Date(c.from))}</span>
                <Avatar p={c.player} size="l" />
                <span className="champ-name">{c.player.display_name}</span>
                <LevelPill level={c.level} />
                <span className="pod-value num">{c.score}<small>คะแนน</small></span>
                {c.provisional ? <span className="champ-prov">ยังไม่จบสัปดาห์</span> : null}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Hud>
  );
}
