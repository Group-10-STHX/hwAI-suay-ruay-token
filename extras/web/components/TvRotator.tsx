'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Leaderboard } from '@/lib/types';
import { Board } from './Board';

/** Rotates boards every 10 s and pulls fresh server data every 30 s. Pauses while hidden. */
export function TvRotator({ boards }: { boards: Leaderboard[] }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  useEffect(() => {
    const rot = setInterval(() => { if (!document.hidden) setI((x) => x + 1); }, 10_000);
    const ref = setInterval(() => { if (!document.hidden) router.refresh(); }, 30_000);
    return () => { clearInterval(rot); clearInterval(ref); };
  }, [router]);
  const b = boards[i % boards.length];
  return (
    <div>
      <div className="tv-progress" aria-hidden="true"><i key={i} /></div>
      <Board data={b} interactive={false} />
    </div>
  );
}
