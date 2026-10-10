import type { PlayerRef } from '@/lib/types';
import { LEVEL_LABEL, initial } from '@/lib/format';

export function Avatar({ p, size = '' }: { p: PlayerRef; size?: '' | 's' | 'l' | 'xl' }) {
  return (
    <span className={`av${size ? ` av-${size}` : ''}`} style={{ ['--h' as string]: p.avatar_hue }} aria-hidden="true">
      {initial(p.display_name)}
    </span>
  );
}

export function LevelPill({ level }: { level: number }) {
  return (
    <span className="lv" style={{ ['--c' as string]: `var(--lv${level})` }}>
      <i />Lv{level} <span className="lv-name">{LEVEL_LABEL[level]}</span>
    </span>
  );
}

/** Rotating target reticle drawn around an avatar. */
export function Reticle() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="10 8" />
      <path d="M50 0v12M50 88v12M0 50h12M88 50h12" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function Delta({ d, show }: { d: number | null; show: boolean }) {
  if (!show) return <span className="dl" />;
  if (d === null) return <span className="dl">NEW</span>;
  if (d > 0) return <span className="dl up"><span aria-hidden="true">▲</span>{d}<span className="sr"> อันดับขึ้น</span></span>;
  if (d < 0) return <span className="dl down"><span aria-hidden="true">▼</span>{-d}<span className="sr"> อันดับลง</span></span>;
  return <span className="dl"><span aria-hidden="true">–</span><span className="sr">อันดับเท่าเดิม</span></span>;
}

export function Hud({ code, title, sub, right, className = '', children, id }: {
  code: string; title: string; sub?: React.ReactNode; right?: React.ReactNode; className?: string; children: React.ReactNode; id?: string;
}) {
  return (
    <section className={`hud ${className}`} aria-labelledby={id}>
      <div className="hud-head">
        <div>
          <p className="hud-code">{code}</p>
          <h2 className="hud-title" id={id}>{title}</h2>
          {sub ? <p className="hud-sub">{sub}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
