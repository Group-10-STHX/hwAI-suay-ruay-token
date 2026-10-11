'use client';
// Sticker wall: newest first, click to enlarge (Esc / click to close).
import { useEffect, useState } from 'react';
import type { StickerItem } from '@/lib/types';
import { LEVEL_LABEL, dLong } from '@/lib/format';
import { Sticker } from './bits';

export function StickerWall({ items, name }: { items: StickerItem[]; name: string }) {
  const [open, setOpen] = useState<StickerItem | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <ul className="wall">
        {items.map((s) => (
          <li key={s.wai_id}>
            <button type="button" onClick={() => setOpen(s)} aria-label={`ขยาย sticker ${s.score} คะแนน`}>
              <Sticker url={s.url} size={104} alt={`sticker ไหว้ ${s.score} คะแนน ของ ${name}`} />
              <small>{s.score} · Lv{s.level}{s.simulated ? ' · SIM' : ''}</small>
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <div className="zoom" role="dialog" aria-modal="true" aria-label="sticker ขยาย" onClick={() => setOpen(null)}>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={open.url} alt={`sticker ไหว้ ${open.score} คะแนน`} width={520} height={520} />
            <figcaption>{name} · {open.score} คะแนน · {LEVEL_LABEL[open.level]} · {dLong.format(new Date(open.created_at))}{open.simulated ? ' · จำลอง' : ''}</figcaption>
            <button type="button" className="btn" autoFocus>ปิด</button>
          </figure>
        </div>
      ) : null}
    </>
  );
}
