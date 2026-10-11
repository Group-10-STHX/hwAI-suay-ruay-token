// hwAI Web Guard: pure logic (no DOM, no chrome.*). Shared by content.js,
// background.js (importScripts) and node tests.
(function (root) {
  'use strict';

  var DAEMON = 'http://127.0.0.1:7777';
  var CAP_MS = 5 * 60 * 1000; // never hold a send longer than 5 minutes

  var SITE_TABLE = [
    { match: /(^|\.)claude\.ai$/i, key: 'claude', source: 'claude-web', label: 'Claude (เว็บ)' },
    { match: /(^|\.)chatgpt\.com$/i, key: 'chatgpt', source: 'chatgpt', label: 'ChatGPT (เว็บ)' },
    { match: /(^|\.)chat\.openai\.com$/i, key: 'chatgpt', source: 'chatgpt', label: 'ChatGPT (เว็บ)' },
    { match: /(^|\.)gemini\.google\.com$/i, key: 'gemini', source: 'gemini-web', label: 'Gemini (เว็บ)' },
  ];

  function siteFromHostname(hostname) {
    var h = String(hostname || '').trim().toLowerCase();
    for (var i = 0; i < SITE_TABLE.length; i++) {
      if (SITE_TABLE[i].match.test(h)) {
        var s = SITE_TABLE[i];
        return { key: s.key, source: s.source, label: s.label };
      }
    }
    return null;
  }

  // Normalised input for the session hash: hostname + pathname only.
  // Query, hash and trailing slash are dropped so ids stay stable.
  function sessionInput(hostname, pathname) {
    var h = String(hostname || '').trim().toLowerCase();
    var p = String(pathname || '/').split('?')[0].split('#')[0].toLowerCase();
    if (p.length > 1) p = p.replace(/\/+$/, '');
    if (!p) p = '/';
    return h + p;
  }

  async function shortHash(input, subtle) {
    var s = subtle || (root.crypto && root.crypto.subtle);
    var data = new TextEncoder().encode(input);
    var buf = await s.digest('SHA-256', data);
    var bytes = new Uint8Array(buf);
    var hex = '';
    for (var i = 0; i < 6; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return 'web-' + hex;
  }

  // Result of one step of the wait loop.
  // input: { status?: number, error?: 'network'|'timeout', elapsedMs: number, capMs?: number }
  // returns: { next: 'allow'|'poll'|'release', reason }
  //   allow   = daemon answered 200
  //   release = let the send through (404, error, cap, unexpected status)
  function decideWaitStep(input) {
    var cap = input.capMs == null ? CAP_MS : input.capMs;
    if (input.elapsedMs >= cap) return { next: 'release', reason: 'cap' };
    if (input.error === 'timeout') return { next: 'poll', reason: 'timeout' };
    if (input.error) return { next: 'release', reason: 'network' };
    if (input.status === 200) return { next: 'allow', reason: 'answered' };
    if (input.status === 202) return { next: 'poll', reason: 'pending' };
    if (input.status === 404) return { next: 'release', reason: 'expired' };
    return { next: 'release', reason: 'unexpected-' + input.status };
  }

  // monitor: true | false | undefined (old daemon without the field)
  function badgeText(monitor) {
    return monitor === false ? 'ไหว้กูซะก่อนส่ง…' : 'กำลังบันทึกการใช้ AI…';
  }

  var api = {
    DAEMON: DAEMON, CAP_MS: CAP_MS, SITE_TABLE: SITE_TABLE,
    siteFromHostname: siteFromHostname, sessionInput: sessionInput,
    shortHash: shortHash, decideWaitStep: decideWaitStep, badgeText: badgeText,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WaiLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
