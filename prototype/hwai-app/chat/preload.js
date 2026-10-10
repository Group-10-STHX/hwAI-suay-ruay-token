'use strict';

// Preload for the chat windows (claude.ai, chatgpt.com) opened by the hwAI app.
// It holds Enter and send clicks until the app allows the work, then replays the send with
// the page's own send button. The gate itself lives in the main process (main.js).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hwai', {
  // Resolves with 'allow' once a wai has passed for this request.
  gate: (label) => ipcRenderer.invoke('gate:wait', String(label ?? '').slice(0, 80)),
});

const SITES = {
  'claude.ai': {
    composer: ['div[contenteditable="true"].ProseMirror', 'div[contenteditable="true"]'],
    send: ['button[aria-label="Send message"]', 'button[aria-label*="Send"]'],
  },
  'chatgpt.com': {
    composer: ['#prompt-textarea', 'div[contenteditable="true"]'],
    send: ['button[data-testid="send-button"]', 'button[aria-label*="Send"]'],
  },
};

const site = SITES[location.hostname.replace(/^www\./, '')];

if (site) {
  let bypass = false; // true only while replaying an allowed send
  let busy = false; // one gate at a time
  let badge = null;

  const pick = (selectors) => {
    for (const s of selectors) {
      const node = document.querySelector(s);
      if (node) return node;
    }
    return null;
  };

  const composerText = () => {
    const c = pick(site.composer);
    return c ? (c.value ?? c.innerText ?? '').trim() : '';
  };

  const inComposer = (node) => node instanceof Element && site.composer.some((s) => node.closest(s));

  const sendButtonFrom = (node) => {
    if (!(node instanceof Element)) return null;
    for (const s of site.send) {
      const button = node.closest(s);
      if (button) return button;
    }
    return null;
  };

  function showBadge(text) {
    if (!badge) {
      badge = document.createElement('div');
      Object.assign(badge.style, {
        position: 'fixed',
        left: '50%',
        bottom: '24px',
        transform: 'translateX(-50%)',
        zIndex: '2147483647',
        padding: '8px 14px',
        borderRadius: '999px',
        font: "600 13px/1.2 system-ui, 'Noto Sans Thai', sans-serif",
        boxShadow: '0 6px 18px rgba(0,0,0,.25)',
        pointerEvents: 'none',
        background: '#1d1b18',
        color: '#f5f2ec',
      });
      document.documentElement.append(badge);
    }
    badge.textContent = text;
  }

  const hideBadge = () => {
    badge?.remove();
    badge = null;
  };

  function replaySend() {
    const button = pick(site.send);
    bypass = true;
    try {
      if (button && !button.disabled) {
        button.click();
      } else {
        pick(site.composer)?.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }),
        );
      }
    } finally {
      bypass = false;
    }
  }

  async function runGate() {
    if (busy) return;
    busy = true;
    showBadge('ไหว้กูซะก่อนส่ง…');
    try {
      const result = await window.hwai.gate(composerText());
      if (result !== 'allow') return;
      hideBadge();
      replaySend();
    } finally {
      busy = false;
    }
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (bypass || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      if (!inComposer(e.target) || !composerText()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      runGate();
    },
    true,
  );

  document.addEventListener(
    'click',
    (e) => {
      if (bypass) return;
      if (!sendButtonFrom(e.target) || !composerText()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      runGate();
    },
    true,
  );
}
