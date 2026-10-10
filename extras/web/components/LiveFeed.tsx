'use client';
// Live transmission log. Subscribes to /api/v1/feed/stream (SSE) and refreshes the server-rendered
// boards at most once every 10 s. Disconnects while the tab is hidden.
import { useEffect, useRef, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FeedItem } from '@/lib/types';
import { LEVEL_LABEL, SOURCE_LABEL, relTime } from '@/lib/format';
import { Avatar } from './bits';

function status(it: FeedItem): [string, string, string] {
  if (it.forgave) return ['st-good', '🙏', 'ง้อสำเร็จ'];
  if (it.beautiful) return ['st-beauty', '✦', 'ไหว้สวย'];
  if (it.passed) return ['st-good', '✓', 'ผ่าน'];
  if (it.action === 'retry') return ['st-warn', '↻', 'ไม่สวย'];
  if (it.action === 'deny') return ['st-serious', '✕', 'งอน'];
  return ['st-critical', '💢', 'เลิกคุย'];
}

export function LiveFeed({ initial, refresh = true }: { initial: FeedItem[]; refresh?: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [online, setOnline] = useState(false);
  const [, setTick] = useState(0);
  const fresh = useRef(new Set<string>());

  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = 0;
    const schedule = () => {
      if (!refresh || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        last = Date.now();
        startTransition(() => router.refresh());
      }, Math.max(0, 10_000 - (Date.now() - last)));
    };
    const connect = () => {
      if (es) return;
      es = new EventSource('/api/v1/feed/stream');
      es.onopen = () => setOnline(true);
      es.onerror = () => setOnline(false);
      es.addEventListener('wai', (e) => {
        const it = JSON.parse((e as MessageEvent).data) as FeedItem;
        fresh.current.add(it.id);
        setItems((prev) => (prev.some((x) => x.id === it.id) ? prev : [it, ...prev].slice(0, 20)));
        schedule();
      });
    };
    const disconnect = () => { es?.close(); es = null; setOnline(false); };
    const onVis = () => (document.hidden ? disconnect() : connect());
    connect();
    document.addEventListener('visibilitychange', onVis);
    const clock = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => {
      disconnect();
      clearTimeout(timer);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [router, refresh]);

  return (
    <>
      <p className={`feed-status${online ? '' : ' off'}`}><i aria-hidden="true" />{online ? 'UPLINK ACTIVE' : 'RECONNECTING…'}</p>
      <ul className="feed" aria-live="polite" aria-relevant="additions">
        {items.map((it) => {
          const [cls, icon, text] = status(it);
          return (
            <li key={it.id} className={fresh.current.has(it.id) ? 'enter' : undefined}>
              <Avatar p={it.player} size="s" />
              <span className="txt">
                <b>{it.player.display_name}</b> {LEVEL_LABEL[it.level]} · {it.score} คะแนน
                <span className="meta">
                  {SOURCE_LABEL[it.source] ?? it.source} · {it.kind.toUpperCase()} · <time dateTime={it.created_at} suppressHydrationWarning>{relTime(it.created_at)}</time>
                </span>
              </span>
              <span className={`st ${cls}`}><i aria-hidden="true">{icon}</i>{text}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
