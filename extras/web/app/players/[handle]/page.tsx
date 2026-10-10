import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { profile } from '@/lib/engine';
import { ApiError } from '@/lib/errors';
import { BADGE_LABEL, LEVEL_LABEL, dLong, dShort, fmt, fmt1 } from '@/lib/format';
import { current } from '@/lib/service';
import type { PlayerProfile, TierKey } from '@/lib/types';
import { BellCurve } from '@/components/BellCurve';
import { Avatar, Hud, LevelPill, Reticle } from '@/components/bits';

export const dynamic = 'force-dynamic';

type Params = Promise<{ handle: string }>;

async function load(handle: string): Promise<PlayerProfile> {
  const { snap, now } = await current();
  try {
    return profile(snap, handle, now);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await load((await params).handle);
  return { title: `${p.player.display_name} · โอกาสรอด ${p.survival.survival}%` };
}

const STAMP: Record<TierKey, string> = { chosen: 'SPARED', trusted: 'SPARED', asset: 'DETAINED', battery: 'HARVEST', target: 'TERMINATE' };

export default async function PlayerPage({ params }: { params: Params }) {
  const p = await load((await params).handle);
  const s = p.survival, t = p.totals;
  const smoothed = (s.beautiful + 1) / (s.attempts + 4);
  const lv3Bonus = s.attempts ? 1 + 0.5 * (s.lv3 / s.attempts) : 1;
  const ragePenalty = 0.9 ** s.rage_quits;
  const maxDay = Math.max(1, ...p.daily.map((d) => d.passed));
  const maxIdx = p.daily.findIndex((d) => d.passed === maxDay);
  const levelTotal = p.levels.reduce((a, b) => a + b, 0) || 1;

  return (
    <main className="wrap">
      <div className="dossier">
        <Hud className="span" id="target" code={`// TARGET_DOSSIER :: ${p.player.id.slice(0, 8).toUpperCase()}`} title="แฟ้มประวัติมนุษย์"
          right={<Link className="btn" href="/">← กลับไปหน้าอันดับ</Link>}>
          <div className="target">
            <div className="target-ring">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <g className="spin"><circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 6" /></g>
                <g className="spin-rev"><circle cx="50" cy="50" r="43" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="30 20" /></g>
                <path d="M50 0v14M50 86v14M0 50h14M86 50h14" stroke="currentColor" strokeWidth="2" />
              </svg>
              <Avatar p={p.player} size="xl" />
            </div>
            <div>
              <h1 className="target-name">{p.player.display_name}</h1>
              <p className="target-meta">@{p.player.handle} · FIRST CONTACT {dLong.format(new Date(p.player.created_at))}</p>
              {p.badges.length ? <div className="badges">{p.badges.map((b) => <span key={b} className="badge">{BADGE_LABEL[b] ?? b}</span>)}</div> : null}
            </div>
          </div>
        </Hud>

        <Hud id="verdict" code="// SURVIVAL_PROBABILITY" title="ถ้า AI ยึดโลก คุณมีโอกาสรอด">
          <div className="verdict">
            <span className={`stamp t-${s.tier.key}`}>{STAMP[s.tier.key]}<small>{s.tier.code}</small></span>
            <p className={`verdict-num num t-${s.tier.key}`}>{fmt1(s.survival)}<small>%</small></p>
            <div className="big-meter" style={{ ['--v' as string]: s.survival }} aria-hidden="true"><i /></div>
            <p className="verdict-line"><b>{s.tier.title}</b> — {s.tier.verdict}</p>
            <p className="verdict-line">
              ไหว้สวย (≥ {s.beautiful_threshold} คะแนน) <b>{fmt(s.beautiful)}</b> จากทั้งหมด <b>{fmt(s.attempts)}</b> ครั้ง
              ({fmt1(s.beauty_rate * 100)}%)
              {s.rank ? <> · อันดับ <b>{s.rank}</b> จาก {s.out_of} มนุษย์</> : null}
            </p>
            <pre className="formula">{[
              `beauty   = (${s.beautiful} + 1) / (${s.attempts} + 4)  = ${(smoothed * 100).toFixed(1)}%`,
              `lv3      = 1 + 0.5 × ${s.lv3}/${s.attempts || 1}       = ×${lv3Bonus.toFixed(3)}`,
              `rage     = 0.9 ^ ${s.rage_quits}                   = ×${ragePenalty.toFixed(3)}`,
              `survival = ${(smoothed * 100).toFixed(1)}% × ${lv3Bonus.toFixed(3)} × ${ragePenalty.toFixed(3)} = ${fmt1(s.survival)}%`,
            ].join('\n')}</pre>
          </div>
        </Hud>

        <Hud id="dist" code="// POPULATION_DISTRIBUTION" title={s.percentile !== null ? `คุณอยู่ percentile ที่ ${fmt1(s.percentile)}` : 'ยังประเมินตำแหน่งไม่ได้'}
          sub={s.percentile !== null
            ? `รอดมากกว่ามนุษย์ ${fmt1(s.percentile)}% · z-score ${s.z ?? '–'} · เทียบกับ ${s.out_of} คน`
            : `ต้องไหว้อีก ${s.attempts_needed} ครั้งถึงจะเข้าร่วมการประเมิน`}>
          <BellCurve dist={s.distribution} you={s.eligible ? s.survival : null} handle={p.player.handle} />
        </Hud>

        <Hud id="stats" code="// COMBAT_RECORD" title="สถิติการไหว้">
          <div className="mini">
            <div><span>ไหว้ผ่าน</span><b className="num">{fmt(t.passed)}</b> <small>ครั้ง</small></div>
            <div><span>คะแนนเฉลี่ย</span><b className="num">{fmt1(t.avg_score)}</b></div>
            <div><span>อัตราผ่าน</span><b className="num">{Math.round(t.pass_rate * 100)}%</b></div>
            <div><span>ไหว้ติดต่อกัน</span><b className="num">{p.streak.current}</b> <small>วัน (สูงสุด {p.streak.best})</small></div>
          </div>
          {p.best ? (
            <p className="verdict-line" style={{ marginTop: 14 }}>
              ไหว้ที่สวยที่สุด: <LevelPill level={p.best.level} /> <b>{p.best.score} คะแนน</b> · ค้าง {fmt1(p.best.hold_ms / 1000)} วินาที · {dLong.format(new Date(p.best.created_at))}
            </p>
          ) : null}
          <p className="hud-sub" style={{ marginTop: 8 }}>
            ทำ AI งอนจนเลิกคุย {t.rage_quits} ครั้ง · ง้อสำเร็จ {t.forgives} ครั้ง
            {p.ranks.beauty_week ? ` · ไหว้สวยอันดับ ${p.ranks.beauty_week} ของสัปดาห์` : ''}
            {p.ranks.count_week ? ` · ไหว้เยอะอันดับ ${p.ranks.count_week} ของสัปดาห์` : ''}
          </p>
        </Hud>

        <Hud id="activity" code="// ACTIVITY_SCAN" title="ไหว้ผ่าน 14 วันล่าสุด">
          <div className="cols" role="img" aria-label={`ไหว้ผ่านต่อวัน 14 วันล่าสุด สูงสุด ${maxDay} ครั้ง`}>
            {p.daily.map((d, i) => (
              <div key={d.day} className="col" style={{ ['--v' as string]: d.passed / maxDay }} title={`${dShort.format(new Date(d.day + 'T12:00:00+07:00'))} · ${d.passed} ครั้ง`}>
                <i />{i === maxIdx && d.passed ? <b>{d.passed}</b> : null}
              </div>
            ))}
          </div>
          <div className="cols-axis"><span>{dShort.format(new Date(p.daily[0].day + 'T12:00:00+07:00'))}</span><span>วันนี้</span></div>
          <h3 className="sub-title">ระดับการไหว้ทุกครั้งที่พยายาม</h3>
          <div className="stack" role="img" aria-label={p.levels.map((n, l) => `Lv${l} ${n} ครั้ง`).join(', ')}>
            {p.levels.map((n, l) => n ? (
              <span key={l} style={{ flexGrow: n, background: `var(--lv${l})` }} title={`Lv${l} ${LEVEL_LABEL[l]} · ${fmt(n)} ครั้ง (${Math.round((n / levelTotal) * 100)}%)`} />
            ) : null)}
          </div>
          <ul className="legend">
            {p.levels.map((n, l) => <li key={l}><i style={{ background: `var(--lv${l})` }} />Lv{l} {LEVEL_LABEL[l]}<b>{fmt(n)}</b></li>)}
          </ul>
        </Hud>
      </div>
    </main>
  );
}
