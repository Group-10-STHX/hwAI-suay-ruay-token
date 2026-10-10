// Server-Sent Events: `event: wai` with one FeedItem per message. Polls the store every 2 s.
import { feed } from '@/lib/engine';
import { current } from '@/lib/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_LIFETIME = 5 * 60_000; // clients (EventSource) reconnect automatically

export async function GET(req: Request) {
  const enc = new TextEncoder();
  let last = new Date().toISOString();
  let timer: ReturnType<typeof setInterval> | undefined;
  const started = Date.now();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (s: string) => controller.enqueue(enc.encode(s));
      const close = () => { clearInterval(timer); try { controller.close(); } catch { /* already closed */ } };
      send('retry: 3000\n: connected\n\n');
      let beats = 0;
      timer = setInterval(async () => {
        if (req.signal.aborted || Date.now() - started > MAX_LIFETIME) return close();
        try {
          const { snap } = await current();
          const { items } = feed(snap, { after: last, limit: 20 });
          for (const it of items.reverse()) {
            send(`id: ${it.id}\nevent: wai\ndata: ${JSON.stringify(it)}\n\n`);
            last = it.created_at;
          }
          if (++beats % 7 === 0) send(': ping\n\n');
        } catch {
          close();
        }
      }, 2000);
      req.signal.addEventListener('abort', close);
    },
    cancel() { clearInterval(timer); },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    },
  });
}
