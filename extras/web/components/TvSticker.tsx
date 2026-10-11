'use client';
// Pops up the sticker of the newest wai that has one. Polls the public feed (the sticker is uploaded
// a moment AFTER its wai, so the SSE event alone is too early). Pauses while the tab is hidden.
import { useEffect, useRef, useState } from 'react';
import type { FeedItem } from '@/lib/types';
import { LEVEL_LABEL } from '@/lib/format';

const SHOW_MS = 9000;

export function TvSticker({ initialIds }: { initialIds: string[] }) {
  const seen = useRef(new Set(initialIds));
  const [pop, setPop] = useState<FeedItem | null>(null);
  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch('/api/v1/feed?limit=12', { cache: 'no-store' });
        if (!r.ok) return;
        const { items } = (await r.json()) as { items: FeedItem[] };
        const fresh = items.filter((i) => i.sticker_url && !seen.current.has(i.id)).reverse();
        if (!fresh.length) return;
        fresh.forEach((i) => seen.current.add(i.id));
        const it = fresh[fresh.length - 1];
        setPop(it);
        clearTimeout(hide);
        hide = setTimeout(() => setPop(null), SHOW_MS);
      } catch { /* offline: try again next tick */ }
    };
    const t = setInterval(tick, 3000);
    return () => { clearInterval(t); clearTimeout(hide); };
  }, []);
  if (!pop?.sticker_url) return null;
  return (
    <div className="tv-pop" key={pop.id} aria-live="polite">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pop.sticker_url} alt={`sticker ของ ${pop.player.display_name}`} width={200} height={200} />
      <b>{pop.player.display_name}</b>
      <span>{LEVEL_LABEL[pop.level]} · {pop.score} คะแนน</span>
    </div>
  );
}
