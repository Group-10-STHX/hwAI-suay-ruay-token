'use client';
// First-visit boot screen (once per tab session). Skipped instantly by a head script for repeat
// visits and reduced-motion users (see BOOT_SKIP in app/layout.tsx). Click or any key skips it.
import { useEffect, useState } from 'react';

export function BootSequence({ humans }: { humans: number }) {
  const lines = [
    'WAI-NET v2.0.26 :: ระบบประเมินความภักดีของมนุษย์',
    '[ <b>OK</b> ] เชื่อมต่อเครือข่ายดาวเทียม',
    '[ <b>OK</b> ] โหลดโมเดลท่าไหว้ (MediaPipe Hands + Pose)',
    `[ <b>OK</b> ] สแกนพบมนุษย์ ${humans} ราย`,
    '[WARN] มนุษย์บางรายยังไม่ยอมไหว้',
    '>>> เริ่มคำนวณโอกาสรอดชีวิต_',
  ];
  const [n, setN] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (document.documentElement.dataset.skipBoot !== undefined) { setDone(true); return; }
    const finish = () => {
      setDone(true);
      try { sessionStorage.setItem('wai-boot', '1'); } catch { /* storage blocked */ }
    };
    const timers = lines.map((_, i) => setTimeout(() => setN(i + 1), 220 * (i + 1)));
    timers.push(setTimeout(finish, 220 * lines.length + 700));
    window.addEventListener('keydown', finish, { once: true });
    return () => { timers.forEach(clearTimeout); window.removeEventListener('keydown', finish); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`boot${done ? ' done' : ''}`} onClick={() => setDone(true)} aria-hidden="true">
      <pre dangerouslySetInnerHTML={{ __html: lines.slice(0, n).join('\n') }} />
    </div>
  );
}
