// hwAI Web Guard content script. Intercepts send (Enter / send button) in the
// capture phase, asks the daemon via the background worker, then replays.
// It only checks whether the composer is non-empty; it never reads or sends text.
(function () {
  'use strict';
  const L = globalThis.WaiLogic;
  const site = L.siteFromHostname(location.hostname);
  if (!site) return;

  // ---- Selectors: edit here when a site changes its DOM -------------------
  const SITES = {
    claude: {
      composer: [
        'div.ProseMirror[contenteditable="true"]',
        '[data-testid="chat-input"]',
        'div[contenteditable="true"][role="textbox"]',
      ],
      send: [
        'button[aria-label="Send message"]',
        'button[aria-label*="Send"]',
        'button[data-testid="send-button"]',
      ],
    },
    chatgpt: {
      composer: ['#prompt-textarea', 'div#prompt-textarea[contenteditable="true"]', 'textarea[name="prompt-textarea"]'],
      send: ['button[data-testid="send-button"]', 'button[aria-label="Send prompt"]', 'button[aria-label*="Send"]'],
    },
    gemini: {
      composer: ['rich-textarea div.ql-editor[contenteditable="true"]', 'rich-textarea [contenteditable="true"]', 'div[contenteditable="true"][role="textbox"]'],
      send: ['button[aria-label*="Send"]', 'button[aria-label*="ส่ง"]', 'button.send-button'],
    },
  };
  // --------------------------------------------------------------------------

  const cfg = SITES[site.key];
  const MAX_HOLD = L.CAP_MS;
  let bypass = false;      // temporary popup switch
  let replaying = false;   // our own replay in progress
  let holding = false;     // a gate is in flight

  try {
    chrome.storage.local.get('bypass', (v) => { bypass = !!(v && v.bypass); });
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'local' && ch.bypass) bypass = !!ch.bypass.newValue;
    });
  } catch (_) { /* extension context gone: fail open */ }

  const qs = (list, root) => {
    for (const s of list) { const el = (root || document).querySelector(s); if (el) return el; }
    return null;
  };
  const isComposer = (el) => !!el && cfg.composer.some((s) => { try { return el.matches(s) || el.closest(s); } catch (_) { return false; } });
  const findComposer = () => qs(cfg.composer);
  const findSend = () => {
    for (const s of cfg.send) {
      for (const b of document.querySelectorAll(s)) if (!b.disabled && b.getAttribute('aria-disabled') !== 'true') return b;
    }
    return null;
  };
  const isSendButton = (el) => {
    const b = el && el.closest && el.closest('button');
    return b && cfg.send.some((s) => { try { return b.matches(s); } catch (_) { return false; } }) ? b : null;
  };
  const composerHasText = () => {
    const c = findComposer();
    if (!c) return false;
    const v = 'value' in c ? c.value : c.textContent;
    return !!(v && v.trim().length);
  };

  // ---- badge ---------------------------------------------------------------
  let badge = null;
  function showBadge(text) {
    hideBadge();
    badge = document.createElement('div');
    badge.textContent = text;
    badge.setAttribute('style', [
      'position:fixed', 'left:50%', 'bottom:24px', 'transform:translateX(-50%)', 'z-index:2147483647',
      'padding:8px 16px', 'border-radius:999px', 'background:rgba(20,20,24,.92)', 'color:#fff',
      'font:600 14px/1.2 system-ui,sans-serif', 'box-shadow:0 4px 16px rgba(0,0,0,.35)', 'pointer-events:none',
    ].join(';'));
    (document.body || document.documentElement).appendChild(badge);
  }
  function hideBadge() { if (badge) { badge.remove(); badge = null; } }

  // ---- messaging (fail open on any error) -------------------------------
  const send = (msg) => new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (r) => {
        if (chrome.runtime.lastError) return resolve(null);
        resolve(r || null);
      });
    } catch (_) { resolve(null); }
  });
  const withCap = (p) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), MAX_HOLD))]);

  async function gateThenReplay(replay) {
    holding = true;
    try {
      const st = await send({ type: 'status' });
      if (!st || !st.reachable) return; // fail open: replay in finally, no badge
      const sessionId = await L.shortHash(L.sessionInput(location.hostname, location.pathname));
      showBadge(L.badgeText(st.monitor));
      await withCap(send({ type: 'gate', source: site.source, label: site.label, sessionId }));
    } catch (_) { /* fail open */ }
    finally {
      hideBadge();
      holding = false;
      replaying = true;
      try { replay(); } finally { setTimeout(() => { replaying = false; }, 0); }
    }
  }

  function replayViaButton() {
    const b = findSend();
    if (b) { b.click(); return; }
    const c = findComposer();
    if (c) {
      c.focus();
      const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
      c.dispatchEvent(new KeyboardEvent('keydown', opts));
    }
  }

  // ---- interception ---------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (replaying || bypass) return;
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    if (e.ctrlKey || e.metaKey || e.altKey) { /* some sites use Cmd+Enter: still a send */ }
    if (!isComposer(e.target)) return;
    if (!composerHasText()) return;
    if (holding) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    gateThenReplay(replayViaButton);
  }, true);

  document.addEventListener('click', (e) => {
    if (replaying || bypass || !e.isTrusted) return;
    const b = isSendButton(e.target);
    if (!b) return;
    if (!composerHasText()) return;
    if (holding) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    gateThenReplay(() => b.isConnected ? b.click() : replayViaButton());
  }, true);
})();
