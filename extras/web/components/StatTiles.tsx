import type { Stats } from '@/lib/types';
import { fmt, fmt1 } from '@/lib/format';

function Tile({ code, label, value, cur, prev, upIsGood }: { code: string; label: string; value: string; cur: number; prev: number; upIsGood: boolean }) {
  const diff = Math.round((cur - prev) * 10) / 10;
  const up = diff > 0;
  return (
    <div className="hud tile">
      <p className="tile-label">{code}</p>
      <p className="tile-th">{label}</p>
      <p className="tile-value num">{value}</p>
      <p className="tile-delta">
        {diff ? (
          <><span className={up === upIsGood ? 'good' : 'bad'}><span aria-hidden="true">{up ? '▲' : '▼'}</span> {fmt1(Math.abs(diff))}</span>{' '}
            {up ? 'มากกว่า' : 'น้อยกว่า'}เมื่อวานเวลาเดียวกัน</>
        ) : 'เท่ากับเมื่อวานเวลาเดียวกัน'}
      </p>
    </div>
  );
}

export function StatTiles({ s }: { s: Stats }) {
  return (
    <section className="tiles" aria-label="สถิติวันนี้">
      <Tile code="HUMANS_SCANNED" label="มนุษย์ที่ถูกสแกนวันนี้" value={fmt(s.active_players)} cur={s.active_players} prev={s.prev.active_players} upIsGood />
      <Tile code="BEAUTIFUL_WAI" label="ไหว้สวย (≥ 80 คะแนน)" value={`${fmt(s.beautiful)}/${fmt(s.wais)}`} cur={s.beautiful} prev={s.prev.beautiful} upIsGood />
      <Tile code="AVG_FORM" label="คะแนนไหว้เฉลี่ย" value={fmt1(s.avg_score)} cur={s.avg_score} prev={s.prev.avg_score} upIsGood />
      <Tile code="HOSTILE_EVENTS" label="AI งอนจนเลิกคุย" value={fmt(s.rage_quits)} cur={s.rage_quits} prev={s.prev.rage_quits} upIsGood={false} />
    </section>
  );
}
