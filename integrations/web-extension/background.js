// hwAI Web Guard service worker: talks to the local daemon on behalf of pages.
// Never receives prompt text: only {source, label, sessionId}.
importScripts('logic.js');
const L = self.WaiLogic;

async function fetchT(url, opts, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, Object.assign({}, opts, { signal: ctl.signal })); }
  finally { clearTimeout(t); }
}

async function getStatus() {
  try {
    const r = await fetchT(L.DAEMON + '/wai/status', {}, 1500);
    if (!r.ok) return { reachable: false };
    const j = await r.json();
    return { reachable: true, monitor: typeof j.monitor === 'boolean' ? j.monitor : undefined, status: j };
  } catch (_) { return { reachable: false }; }
}

async function bumpCount() {
  try {
    const s = chrome.storage.session;
    const { detections = 0 } = await s.get('detections');
    await s.set({ detections: detections + 1 });
  } catch (_) { /* ignore */ }
}

// Returns {released: bool, reason, action?}. Never throws.
async function gate({ source, label, sessionId }) {
  const started = Date.now();
  let id;
  try {
    const r = await fetchT(L.DAEMON + '/wai/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source, kind: 'prompt', session_id: sessionId, agent_label: label }),
    }, 3000);
    if (!r.ok) return { released: true, reason: 'request-failed' };
    const j = await r.json();
    id = j && j.id;
    if (!id) return { released: true, reason: 'no-id', action: j && j.action };
  } catch (_) { return { released: true, reason: 'unreachable' }; }

  bumpCount();
  for (;;) {
    let step;
    let body = null;
    try {
      const r = await fetchT(L.DAEMON + '/wai/wait/' + encodeURIComponent(id), {}, 70000);
      if (r.status === 200) { try { body = await r.json(); } catch (_) {} }
      step = L.decideWaitStep({ status: r.status, elapsedMs: Date.now() - started });
    } catch (e) {
      step = L.decideWaitStep({ error: e && e.name === 'AbortError' ? 'timeout' : 'network', elapsedMs: Date.now() - started });
    }
    if (step.next !== 'poll') return { released: true, reason: step.reason, action: body && body.action };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg && msg.type === 'status') return sendResponse(await getStatus());
    if (msg && msg.type === 'gate') return sendResponse(await gate(msg));
    sendResponse({ released: true, reason: 'unknown' });
  })().catch(() => sendResponse({ released: true, reason: 'error' }));
  return true;
});
