'use client';
import { useEffect, useState } from 'react';
import { nextMidnight } from '@/lib/time';

/** T-minus to the next Bangkok midnight — when the daily boards reset. */
export function Countdown() {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(nextMidnight(Date.now()) - Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  const s = left === null ? null : Math.max(0, Math.floor(left / 1000));
  const txt = s === null ? '--:--:--' : [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
  return (
    <div>
      <p className="countdown-label">NEXT HUMAN ASSESSMENT · รอบประเมินถัดไป</p>
      <p className="countdown-value" role="timer" aria-live="off">T-{txt}</p>
    </div>
  );
}
