/* Voice backoffice page. Served by the daemon at /admin/voice. Plain browser JS, no build step.
   All dynamic text goes through textContent (never innerHTML). */
(function () {
  'use strict';

  var TARGET_RATE = 24000;
  var MAX_SEC = 15;
  var TARGET_PEAK_DB = -3;
  var KIND_LABEL = { speech: 'ข้อความหลัก', hint: 'บรรทัดรอง', reason: 'ไหว้ผิดเพราะ', 'persona-line': 'ประโยคตัวละคร', extra: 'ประโยคเสริม' };

  // ---------- DSP (pure) ----------
  function trimAndNormalize(pcm, rate) {
    var peak = 0, i;
    for (i = 0; i < pcm.length; i++) { var a = Math.abs(pcm[i]); if (a > peak) peak = a; }
    if (peak < 0.004) return null; // basically silence
    var win = Math.max(1, Math.round(rate * 0.01));
    var thr = Math.max(0.01, peak * 0.04); // conservative: low threshold, generous padding
    var first = -1, last = -1, w, s, sum, rms;
    for (w = 0; w * win < pcm.length; w++) {
      sum = 0;
      var end = Math.min(pcm.length, (w + 1) * win);
      for (s = w * win; s < end; s++) sum += pcm[s] * pcm[s];
      rms = Math.sqrt(sum / (end - w * win));
      if (rms > thr * 0.5) { if (first < 0) first = w; last = w; }
    }
    if (first < 0) return null;
    var padIn = Math.round(rate * 0.15), padOut = Math.round(rate * 0.25);
    var from = Math.max(0, first * win - padIn);
    var to = Math.min(pcm.length, (last + 1) * win + padOut);
    var out = pcm.slice(from, to);
    var target = Math.pow(10, TARGET_PEAK_DB / 20);
    var gain = Math.min(target / peak, 30);
    for (i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i] * gain));
    return out;
  }

  function encodeWav(pcm, rate) {
    var n = pcm.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), i;
    function str(o, t) { for (var k = 0; k < t.length; k++) v.setUint8(o + k, t.charCodeAt(k)); }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    for (i = 0; i < n; i++) {
      var x = Math.max(-1, Math.min(1, pcm[i]));
      v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }

  async function blobToWav(blob) {
    var AC = window.AudioContext || window.webkitAudioContext;
    var ctx = new AC();
    try {
      var decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      var frames = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
      var off = new OfflineAudioContext(1, frames, TARGET_RATE); // mono mixdown + resample
      var src = off.createBufferSource();
      src.buffer = decoded; src.connect(off.destination); src.start();
      var rendered = await off.startRendering();
      var pcm = trimAndNormalize(rendered.getChannelData(0).slice(), TARGET_RATE);
      if (!pcm) return null;
      return { blob: encodeWav(pcm, TARGET_RATE), ms: Math.round((pcm.length / TARGET_RATE) * 1000) };
    } finally { try { ctx.close(); } catch (e) { /* ignore */ } }
  }

  // ---------- small helpers ----------
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function $(id) { return document.getElementById(id); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem('vadmin.' + k); localStorage.setItem('vadmin.' + k, v); } catch (e) { /* private mode */ } return null; }
  function fmtDate(iso) {
    try { return new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return iso; }
  }
  function fmtSec(ms) { return (ms / 1000).toFixed(1) + ' วิ'; }

  // ---------- state ----------
  // หน้าแยกตามตัวละคร: /admin/voice = เลือกตัวละคร, /admin/voice/c/<id> = ห้องอัดของตัวนั้น (id '_app' = ประโยคกลางของแอป)
  var CHAR = (location.pathname.match(/\/admin\/voice\/c\/([A-Za-z0-9_-]+)/) || [])[1] || '';
  var DIRS = {};
  var S = { data: null, offline: false, mode: 'list', tele: { person: 1, todo: true, id: null }, flash: {} };
  var F = { q: '', kind: '', persona: '', state: '', recorder: '', todo: false };
  // R = the single active recording session (only one entry can be recorded at a time)
  var R = { id: null, phase: 'idle', stream: null, mr: null, chunks: [], t0: 0, count: 0, takeBlob: null, takeUrl: null, takeMs: 0, err: null,
    meterCtx: null, analyser: null, level: 0, raf: 0, timers: [], player: null };

  // ---------- api ----------
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'X-Wai-Admin': '1' }, opts.headers || {});
    return fetch(path, opts).then(function (res) {
      setOffline(false);
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) { var e = new Error(body.error || ('HTTP ' + res.status)); e.status = res.status; e.body = body; throw e; }
        return body;
      });
    }, function (err) { setOffline(true); throw err; });
  }
  function setOffline(off) {
    if (S.offline === off) return;
    S.offline = off;
    var c = $('conn'); c.dataset.state = off ? 'off' : 'ok'; c.textContent = off ? 'daemon ออฟไลน์' : 'เชื่อมต่อแล้ว';
    if (off) banner('ต่อ daemon ไม่ได้ ตรวจสอบว่าแอปน้องกำลังรันอยู่ แล้วเปิดหน้านี้จาก http://127.0.0.1:7777/admin/voice ระบบจะลองต่อใหม่เอง', false);
    else banner('');
  }
  function banner(msg, info) {
    var b = $('banner');
    b.hidden = !msg; b.textContent = msg || ''; b.className = 'banner' + (info ? ' info' : '');
  }
  function refresh() {
    return api('/wai/voice/lines').then(function (d) { S.data = d; renderAll(); }, function () { renderAll(); });
  }

  // ---------- derived ----------
  function entries() { return S.data ? S.data.entries : []; }
  function personaOf(e) { return e.persona || '_app'; }
  function listed() { return entries().filter(function (e) { return !e.dupOf && (!CHAR || personaOf(e) === CHAR); }); }
  function aliasesOf(e) { return entries().filter(function (x) { return x.dupOf === e.id; }); }
  function personaName(id) {
    var p = (S.data && S.data.personas || []).filter(function (x) { return x.id === id; })[0];
    return p ? p.name : id;
  }
  function matches(e) {
    if (F.kind && e.kind !== F.kind) return false;
    if (F.persona && personaOf(e) !== F.persona) return false;
    if (F.state && (e.state || e.reason) !== F.state) return false;
    if (F.recorder && String(e.recorder) !== F.recorder) return false;
    if (F.todo && e.status.recorded) return false;
    if (F.q) {
      var q = F.q.toLowerCase();
      if ((e.plainText + ' ' + e.id).toLowerCase().indexOf(q) < 0) return false;
    }
    return true;
  }
  function teleQueue() {
    return listed().filter(function (e) {
      if (!CHAR && e.recorder !== S.tele.person) return false;
      return !(S.tele.todo && e.status.recorded && e.id !== S.tele.id);
    });
  }

  // ---------- recording ----------
  function stopTimers() { R.timers.forEach(clearTimeout); R.timers = []; }
  function releaseMic() {
    if (R.raf) cancelAnimationFrame(R.raf); R.raf = 0;
    if (R.stream) R.stream.getTracks().forEach(function (t) { t.stop(); });
    R.stream = null;
    if (R.meterCtx) { try { R.meterCtx.close(); } catch (e) { /* ignore */ } }
    R.meterCtx = null; R.analyser = null; R.level = 0;
  }
  function dropTake() { if (R.takeUrl) URL.revokeObjectURL(R.takeUrl); R.takeUrl = null; R.takeBlob = null; R.takeMs = 0; }
  function stopPlayer() { if (R.player) { try { R.player.pause(); } catch (e) { /* ignore */ } R.player = null; } }
  function resetSession() {
    stopTimers(); stopPlayer();
    if (R.mr && R.mr.state !== 'inactive') { R.mr.onstop = null; try { R.mr.stop(); } catch (e) { /* ignore */ } }
    R.mr = null; R.chunks = []; releaseMic(); dropTake();
    R.id = null; R.phase = 'idle'; R.err = null;
  }
  function micError(e) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
      return 'เบราว์เซอร์นี้ใช้ไมค์ไม่ได้ ให้เปิดผ่าน http://127.0.0.1:7777/admin/voice (ไม่ใช่ที่อยู่อื่น) และใช้ Chrome หรือ Safari';
    var n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'ไมค์ถูกบล็อก กดไอคอนกุญแจข้างช่อง URL แล้วอนุญาตไมโครโฟนให้หน้านี้ จากนั้นกด ● อัด ใหม่';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'ไม่พบไมโครโฟน ต่อไมค์แล้วลองใหม่';
    if (n === 'NotReadableError') return 'ไมค์ถูกโปรแกรมอื่นใช้อยู่ ปิดโปรแกรมนั้นก่อน';
    return 'เปิดไมค์ไม่สำเร็จ: ' + ((e && e.message) || n || 'unknown');
  }
  function meterLoop() {
    if (!R.analyser) return;
    var buf = new Float32Array(R.analyser.fftSize);
    R.analyser.getFloatTimeDomainData(buf);
    var m = 0; for (var i = 0; i < buf.length; i++) { var a = Math.abs(buf[i]); if (a > m) m = a; }
    R.level = Math.max(m, R.level * 0.85);
    var pct = Math.min(100, Math.round(Math.sqrt(R.level) * 100));
    document.querySelectorAll('[data-meter]').forEach(function (el) { el.style.width = pct + '%'; });
    if (R.phase === 'rec') {
      var sec = (performance.now() - R.t0) / 1000;
      document.querySelectorAll('[data-timer]').forEach(function (el) { el.textContent = sec.toFixed(1) + ' / ' + MAX_SEC + ' วิ'; });
    }
    R.raf = requestAnimationFrame(meterLoop);
  }
  async function startRecording(id) {
    resetSession();
    R.id = id; R.phase = 'count'; R.count = 3; renderAll();
    var stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      if (R.id === id && R.phase === 'count') { R.err = micError(e); R.phase = 'idle'; R.id = null; renderAll(); }
      return;
    }
    if (R.id !== id || R.phase !== 'count') { stream.getTracks().forEach(function (t) { t.stop(); }); return; } // cancelled meanwhile
    R.stream = stream;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      R.meterCtx = new AC();
      var src = R.meterCtx.createMediaStreamSource(R.stream);
      R.analyser = R.meterCtx.createAnalyser(); R.analyser.fftSize = 1024;
      src.connect(R.analyser);
      R.raf = requestAnimationFrame(meterLoop);
    } catch (e) { /* meter is optional */ }
    tick(3);
  }
  function tick(n) {
    if (R.phase !== 'count') return;
    R.count = n; renderAll();
    if (n <= 0) return beginCapture();
    R.timers.push(setTimeout(function () { tick(n - 1); }, 1000));
  }
  function beginCapture() {
    var mimes = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
    var mime = ''; for (var i = 0; i < mimes.length; i++) { if (window.MediaRecorder && MediaRecorder.isTypeSupported(mimes[i])) { mime = mimes[i]; break; } }
    try { R.mr = mime ? new MediaRecorder(R.stream, { mimeType: mime }) : new MediaRecorder(R.stream); }
    catch (e) { R.err = 'เบราว์เซอร์นี้อัดเสียงไม่ได้ (MediaRecorder) ลองใช้ Chrome'; resetSession(); renderAll(); return; }
    R.chunks = [];
    R.mr.ondataavailable = function (ev) { if (ev.data && ev.data.size) R.chunks.push(ev.data); };
    R.mr.onstop = finishCapture;
    R.mr.start();
    R.t0 = performance.now(); R.phase = 'rec'; renderAll();
    R.timers.push(setTimeout(function () { if (R.phase === 'rec') stopRecording(); }, MAX_SEC * 1000));
  }
  function stopRecording() {
    if (R.phase !== 'rec' || !R.mr) return;
    R.phase = 'process'; stopTimers(); renderAll();
    try { R.mr.stop(); } catch (e) { finishCapture(); }
  }
  async function finishCapture() {
    var type = (R.mr && R.mr.mimeType) || 'audio/webm';
    var blob = new Blob(R.chunks, { type: type });
    releaseMic();
    try {
      var out = await blobToWav(blob);
      if (!out) { R.err = 'ไม่ได้ยินเสียงเลย ลองพูดให้ดังขึ้นหรือขยับเข้าใกล้ไมค์ แล้วอัดใหม่'; R.phase = 'idle'; R.id = null; }
      else { R.takeBlob = out.blob; R.takeMs = out.ms; R.takeUrl = URL.createObjectURL(out.blob); R.phase = 'review'; }
    } catch (e) {
      R.err = 'แปลงเสียงไม่สำเร็จ: ' + ((e && e.message) || 'unknown'); R.phase = 'idle'; R.id = null;
    }
    renderAll();
  }
  function cancelCountdown() { resetSession(); renderAll(); }
  function discardTake() { resetSession(); renderAll(); }
  async function keepTake() {
    if (R.phase !== 'review' || !R.takeBlob) return;
    var id = R.id; R.phase = 'upload'; renderAll();
    try {
      await api('/wai/voice/recording?id=' + encodeURIComponent(id), { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: R.takeBlob });
      S.flash[id] = Date.now();
      resetSession();
      await refresh();
      if (S.mode === 'tele') teleStep(1);
    } catch (e) {
      R.err = S.offline ? '' : 'อัปโหลดไม่สำเร็จ: ' + e.message;
      R.phase = 'review'; renderAll();
    }
  }
  function playTake() { stopPlayer(); if (R.takeUrl) { R.player = new Audio(R.takeUrl); R.player.play().catch(function () {}); } }
  function playSaved(e) {
    stopPlayer();
    R.player = new Audio('/wai/voice/recording?id=' + encodeURIComponent(e.id) + '&t=' + encodeURIComponent(e.status.at || ''));
    R.player.play().catch(function () { banner('เล่นเสียงไม่ได้', true); });
  }
  function playInApp(e) {
    api('/wai/voice/play?id=' + encodeURIComponent(e.id), { method: 'POST' })
      .then(function () { banner('ส่งไปเล่นในแอปแล้ว', true); setTimeout(function () { if (!S.offline) banner(''); }, 2000); },
        function (err) { if (!S.offline) banner('เล่นในแอปไม่ได้: ' + err.message); });
  }
  function deleteRec(e) {
    if (!window.confirm('ลบเสียงของประโยคนี้?\n' + e.plainText)) return;
    if (R.id === e.id) resetSession();
    api('/wai/voice/recording?id=' + encodeURIComponent(e.id), { method: 'DELETE' })
      .then(refresh, function (err) { if (!S.offline) banner('ลบไม่สำเร็จ: ' + err.message); });
  }

  // ---------- rendering ----------
  function btn(label, cls, fn, disabled) {
    return h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: fn, disabled: !!disabled, text: label });
  }
  function controlsFor(e) {
    var mine = R.id === e.id;
    var busy = R.phase !== 'idle' && !mine;
    var box = h('div', { class: 'btns' });
    if (mine && R.phase === 'count') {
      box.appendChild(h('span', { class: 'cd', 'data-count': '1', text: String(R.count || '') }));
      box.appendChild(btn('ยกเลิก', '', cancelCountdown));
    } else if (mine && R.phase === 'rec') {
      box.appendChild(btn('■ หยุด', 'rec', stopRecording));
    } else if (mine && R.phase === 'process') {
      box.appendChild(h('span', { class: 'status', text: 'กำลังแปลงเสียง...' }));
    } else if (mine && (R.phase === 'review' || R.phase === 'upload')) {
      box.appendChild(btn('▶ ฟัง', '', playTake, R.phase === 'upload'));
      box.appendChild(btn(R.phase === 'upload' ? 'กำลังส่ง...' : '✓ ใช้อันนี้', 'keep', keepTake, R.phase === 'upload'));
      box.appendChild(btn('อัดใหม่', '', function () { startRecording(e.id); }, R.phase === 'upload'));
      box.appendChild(btn('ทิ้ง', 'danger', discardTake, R.phase === 'upload'));
    } else {
      box.appendChild(btn(e.status.recorded ? 'อัดใหม่' : '● อัด', e.status.recorded ? '' : 'rec', function () { startRecording(e.id); }, busy));
      if (e.status.recorded) {
        box.appendChild(btn('▶ ฟัง', '', function () { playSaved(e); }));
        box.appendChild(btn('ลองฟังในแอป', 'gold', function () { playInApp(e); }));
        box.appendChild(btn('ลบ', 'danger', function () { deleteRec(e); }));
      }
    }
    return box;
  }
  function liveBar(e) {
    if (R.id !== e.id || (R.phase !== 'count' && R.phase !== 'rec')) return null;
    return h('div', { class: 'live' }, [
      h('span', { class: 'rec-dot', text: R.phase === 'rec' ? '● REC' : 'เตรียมตัว' }),
      h('div', { class: 'meter' }, [h('div', { class: 'meter-fill', 'data-meter': '1' })]),
      h('span', { class: 'timer', 'data-timer': '1', text: R.phase === 'rec' ? '0.0 / ' + MAX_SEC + ' วิ' : '' }),
    ]);
  }
  function statusLine(e) {
    var s = e.status, mine = R.id === e.id;
    if (mine && R.phase === 'review') return h('div', { class: 'status', text: 'อัดเสร็จ ' + fmtSec(R.takeMs) + ' ฟังแล้วกด ✓ ใช้อันนี้ (Enter)' });
    if (mine && R.phase === 'upload') return h('div', { class: 'status', text: 'กำลังอัปโหลด...' });
    if (mine && R.err) return h('div', { class: 'status todo', text: R.err });
    if (s.recorded) return h('div', { class: 'status ok', text: '✓ อัดแล้ว ' + fmtDate(s.at) + (s.durationMs != null ? ' · ' + fmtSec(s.durationMs) : '') });
    return h('div', { class: 'status todo', text: '○ ยังไม่อัด' });
  }
  function chipsFor(e) {
    var c = [h('span', { class: 'chip kind', text: KIND_LABEL[e.kind] || e.kind })];
    if (e.persona) c.push(h('span', { class: 'chip', text: e.persona + ' ' + personaName(e.persona) }));
    if (e.state) c.push(h('span', { class: 'chip', text: e.state }));
    if (e.reason) c.push(h('span', { class: 'chip', text: e.reason }));
    c.push(h('span', { class: 'chip who', text: e.recorder ? 'คนที่ ' + e.recorder : 'ไม่กำหนด' }));
    aliasesOf(e).forEach(function (a) { c.push(h('span', { class: 'chip', text: 'ใช้ซ้ำ: ' + a.id })); });
    return h('div', { class: 'chips' }, c);
  }
  function renderRow(e) {
    var cls = 'row ' + (e.status.recorded ? 'done' : 'todo') + (R.id === e.id && R.phase !== 'idle' ? ' active' : '');
    var left = h('div', {}, [h('div', { class: 'phrase', text: e.plainText }), chipsFor(e), statusLine(e)]);
    var row = h('div', { class: cls, 'data-id': e.id }, [left, controlsFor(e)]);
    var lb = liveBar(e); if (lb) row.appendChild(lb);
    return row;
  }
  function renderProgress() {
    var d = S.data; if (!d) return;
    var p = d.progress;
    if (CHAR) {
      var mine = listed();
      p = { total: mine.length, recorded: mine.filter(function (e) { return e.status.recorded; }).length };
    }
    $('overallText').textContent = p.recorded + ' / ' + p.total + ' (' + (p.total ? Math.round(p.recorded * 100 / p.total) : 0) + '%)';
    var f = $('overallFill'); f.style.width = (p.total ? p.recorded * 100 / p.total : 0) + '%'; f.className = 'bar-fill' + (p.total && p.recorded === p.total ? ' done' : '');
    var box = $('people'); box.textContent = '';
    if (CHAR) return;
    [1, 2, 3, 4].forEach(function (n) {
      var q = d.people[n] || { total: 0, recorded: 0 };
      var fill = h('div', { class: 'bar-fill' + (q.total && q.recorded === q.total ? ' done' : '') });
      fill.style.width = (q.total ? q.recorded * 100 / q.total : 0) + '%';
      box.appendChild(h('div', { class: 'person' }, [h('span', {}, ['คนที่ ', h('b', { text: String(n) }), ' · ' + q.recorded + '/' + q.total]), h('div', { class: 'bar' }, [fill])]));
    });
  }
  function fillSelect(sel, label, pairs) {
    var cur = sel.value; sel.textContent = '';
    sel.appendChild(h('option', { value: '', text: label }));
    pairs.forEach(function (p) { sel.appendChild(h('option', { value: p[0], text: p[1] })); });
    sel.value = pairs.some(function (p) { return p[0] === cur; }) ? cur : '';
  }
  var filterSig = '';
  function renderFilters() {
    var all = listed(), seen = {};
    var sig = all.map(function (e) { return (e.persona || '') + (e.state || e.reason || ''); }).join('|') + JSON.stringify((S.data && S.data.personas) || []);
    if (sig === filterSig) return; // do not rebuild (and close) an open dropdown on every poll
    filterSig = sig;
    fillSelect($('fKind'), 'ทุกประเภท', Object.keys(KIND_LABEL).map(function (k) { return [k, KIND_LABEL[k]]; }));
    var pers = [['_app', 'ของแอป (ไม่มีตัวละคร)']];
    ((S.data && S.data.personas) || []).forEach(function (p) { pers.push([p.id, p.id + ' ' + p.name]); });
    fillSelect($('fPersona'), 'ทุกตัวละคร', pers);
    var states = [];
    all.forEach(function (e) { var s = e.state || e.reason; if (s && !seen[s]) { seen[s] = 1; states.push([s, s]); } });
    fillSelect($('fState'), 'ทุกสถานะ', states);
    fillSelect($('fRecorder'), 'ทุกคน', [['1', 'คนที่ 1'], ['2', 'คนที่ 2'], ['3', 'คนที่ 3'], ['4', 'คนที่ 4']]);
    F.kind = $('fKind').value; F.persona = $('fPersona').value; F.state = $('fState').value; F.recorder = $('fRecorder').value;
  }
  function renderList() {
    var rows = listed().filter(matches);
    var box = $('list'); box.textContent = '';
    $('listCount').textContent = S.data ? 'แสดง ' + rows.length + ' จาก ' + listed().length + ' ประโยค' : '';
    if (!rows.length) box.appendChild(h('div', { class: 'empty', text: S.data ? 'ไม่มีประโยคตามตัวกรอง' : (S.offline ? 'ยังเชื่อมต่อ daemon ไม่ได้' : 'กำลังโหลด...') }));
    rows.forEach(function (e) { box.appendChild(renderRow(e)); });
  }
  function renderTele() {
    var q = teleQueue(), box = $('tele'); box.textContent = '';
    if (!q.length) {
      $('telePos').textContent = '';
      box.appendChild(h('div', { class: 'empty', text: S.data ? 'คนที่ ' + S.tele.person + ' อัดครบทุกประโยคแล้ว 🎉 (หรือติ๊กเอา "เฉพาะที่ยังไม่อัด" ออกเพื่อดูทั้งหมด)' : 'กำลังโหลด...' }));
      return;
    }
    var idx = q.findIndex(function (e) { return e.id === S.tele.id; });
    if (idx < 0) idx = 0;
    var e = q[idx]; S.tele.id = e.id;
    $('telePos').textContent = (idx + 1) + ' / ' + q.length;
    box.appendChild(chipsFor(e));
    box.appendChild(h('div', { class: 'phrase', text: e.plainText }));
    var lb = liveBar(e); if (lb) box.appendChild(lb);
    if (R.id === e.id && R.phase === 'count') box.appendChild(h('div', { class: 'cd', 'data-count': '1', text: String(R.count || '') }));
    box.appendChild(statusLine(e));
    var ctl = controlsFor(e);
    var nav = h('div', { class: 'btns' }, [btn('← ก่อนหน้า', '', function () { teleStep(-1); }), btn('ถัดไป →', '', function () { teleStep(1); })]);
    box.appendChild(ctl); box.appendChild(nav);
  }
  function teleStep(d) {
    var q = teleQueue(); if (!q.length) return renderAll();
    var idx = q.findIndex(function (e) { return e.id === S.tele.id; });
    if (R.phase !== 'idle') resetSession();
    idx = (idx + d + q.length) % q.length; S.tele.id = q[idx].id; renderAll();
  }
  function charInfo(id) {
    if (id === '_app') return { id: id, name: 'ประโยคกลางของแอป', description: 'ข้อความหลัก/บรรทัดรองที่ใช้เมื่อไม่มีตัวละคร' };
    return ((S.data && S.data.personas) || []).filter(function (x) { return x.id === id; })[0] || { id: id, name: id, description: '' };
  }
  function renderHub() {
    var box = $('hub'); box.textContent = '';
    var list = ((S.data && S.data.personas) || []).map(function (p) { return p.id; }).concat(['_app']);
    list.forEach(function (id) {
      var info = charInfo(id), d = DIRS[id] || {};
      var mine = entries().filter(function (e) { return !e.dupOf && personaOf(e) === id; });
      var done = mine.filter(function (e) { return e.status.recorded; }).length;
      var fill = h('div', { class: 'bar-fill' + (mine.length && done === mine.length ? ' done' : '') });
      fill.style.width = (mine.length ? done * 100 / mine.length : 0) + '%';
      box.appendChild(h('a', { class: 'card', href: '/admin/voice/c/' + id }, [
        h('div', { class: 'emoji', text: d.emoji || '🎙️' }),
        h('h2', { text: info.name }),
        h('div', { class: 'desc', text: info.description || '' }),
        d.tone ? h('div', { class: 'tone', text: 'เสียง: ' + d.tone }) : h('span'),
        h('div', { class: 'bar' }, [fill]),
        h('div', { class: 'desc', text: 'อัดแล้ว ' + done + ' / ' + mine.length })
      ]));
    });
  }
  function renderBrief() {
    var v = $('briefView'); v.textContent = '';
    var info = charInfo(CHAR), d = DIRS[CHAR] || {};
    var card = h('div', { class: 'brief' }, [h('h2', { text: (d.emoji || '🎙️') + ' ' + info.name }), h('div', { text: info.description || '' })]);
    if (d.tone) {
      card.appendChild(h('dl', {}, [
        h('dt', { text: 'โทนเสียง' }), h('dd', { text: d.tone }),
        h('dt', { text: 'จังหวะ' }), h('dd', { text: d.pace || '' }),
        h('dt', { text: 'อารมณ์' }), h('dd', { text: d.mood || '' }),
        h('dt', { text: 'ห้าม' }), h('dd', { class: 'no', text: d.avoid || '' })
      ]));
      card.appendChild(h('ul', {}, (d.tips || []).map(function (t) { return h('li', { text: t }); })));
    }
    v.appendChild(card);
  }
  function renderAll() {
    renderProgress();
    if (!CHAR && location.pathname.replace(/\/$/, '') === '/admin/voice') { renderHub(); return; }
    if (!S.offline) banner(R.err || '', false);
    if (S.mode === 'list') { renderFilters(); renderList(); } else renderTele();
    // keep meter visible immediately after re-render
    document.querySelectorAll('[data-meter]').forEach(function (el) { el.style.width = Math.min(100, Math.round(Math.sqrt(R.level) * 100)) + '%'; });
  }

  function setMode(m) {
    S.mode = m; store('mode', m);
    $('listView').hidden = m !== 'list'; $('teleView').hidden = m !== 'tele';
    $('modeList').classList.toggle('on', m === 'list'); $('modeTele').classList.toggle('on', m === 'tele');
    if (R.phase !== 'idle') resetSession();
    renderAll();
  }

  // ---------- events ----------
  function onKey(ev) {
    if (S.mode !== 'tele') return;
    var t = ev.target && ev.target.tagName;
    if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
    var q = teleQueue(), cur = q.filter(function (e) { return e.id === S.tele.id; })[0];
    if (!cur) return;
    if (ev.code === 'Space') {
      ev.preventDefault();
      if (R.id === cur.id && R.phase === 'rec') stopRecording();
      else if (R.id === cur.id && R.phase === 'count') cancelCountdown();
      else if (R.phase === 'idle' || (R.id === cur.id && R.phase === 'review')) startRecording(cur.id);
    } else if (ev.key === 'Enter') {
      ev.preventDefault(); if (R.id === cur.id && R.phase === 'review') keepTake();
    } else if (ev.key === 'ArrowRight') { ev.preventDefault(); teleStep(1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); teleStep(-1); }
  }
  function setupPage() {
    var hub = !CHAR;
    $('hubView').hidden = !hub;
    $('briefView').hidden = hub;
    if (hub) {
      $('listView').hidden = true; $('teleView').hidden = true;
      document.querySelector('.modes').hidden = true;
      document.querySelector('.overall').hidden = false;
      return;
    }
    $('crumb').textContent = '/ ' + charInfo(CHAR).name;
    document.title = 'อัดเสียง · ' + charInfo(CHAR).name;
    $('fPersona').hidden = true;
    var tp = $('tPerson'); if (tp && tp.parentNode) tp.parentNode.hidden = true;
  }
  // ---------- โหมดเสียงของแอป: siri (เสียงระบบ) | human (เสียงที่อัดไว้) ----------
  var VM = { mode: null, recorded: 0, total: 0 };
  function renderVoiceMode() {
    var box = $('modeBox'); if (!box) return;
    ['siri', 'human'].forEach(function (m) {
      var el = document.querySelector('[data-voice-mode="' + m + '"]');
      if (el) el.classList.toggle('on', VM.mode === m);
    });
    $('modeNote').textContent = VM.total ? 'อัดแล้ว ' + VM.recorded + ' / ' + VM.total + ' ประโยค' : '';
    $('humanDesc').textContent = VM.recorded >= VM.total && VM.total
      ? 'ใช้เสียงที่เพื่อนอัดครบทุกบทแล้ว'
      : 'ใช้เสียงที่เพื่อนอัดจากหน้านี้ · ยังไม่อัด ' + Math.max(0, VM.total - VM.recorded) + ' ประโยค (บทที่ยังไม่อัดใช้เสียงสังเคราะห์แทนชั่วคราว)';
  }
  function loadVoiceMode(body) {
    var opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
    return api('/wai/voice/mode', opts).then(function (d) { VM = d; renderVoiceMode(); return d; }, function () {});
  }
  function pickVoiceMode(m) {
    loadVoiceMode({ mode: m }).then(function () {
      // ฟังตัวอย่างทันที (ใช้ตัวละครที่เลือกอยู่ในแอป)
      fetch('/wai/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ demo: 'DEMANDING' }) }).catch(function () {});
    });
  }
  function initVoiceMode() {
    if (CHAR || !$('modeBox')) return;
    document.querySelectorAll('[data-voice-mode]').forEach(function (b) {
      b.addEventListener('click', function () { pickVoiceMode(b.getAttribute('data-voice-mode')); });
    });
    loadVoiceMode();
  }

  function init() {
    initVoiceMode();
    fetch('/admin/voice/characters.json').then(function (r) { return r.json(); }).then(function (j) { DIRS = j || {}; if (S.data) { if (CHAR) renderBrief(); renderAll(); } }, function () {});
    setupPage();
    $('modeList').addEventListener('click', function () { setMode('list'); });
    $('modeTele').addEventListener('click', function () { setMode('tele'); });
    $('fSearch').addEventListener('input', function (ev) { F.q = ev.target.value.trim(); renderList(); });
    ['fKind:kind', 'fPersona:persona', 'fState:state', 'fRecorder:recorder'].forEach(function (p) {
      var kv = p.split(':'); $(kv[0]).addEventListener('change', function (ev) { F[kv[1]] = ev.target.value; renderList(); });
    });
    $('fTodo').addEventListener('change', function (ev) { F.todo = ev.target.checked; renderList(); });
    var saved = parseInt(store('person') || '1', 10);
    S.tele.person = saved >= 1 && saved <= 4 ? saved : 1; $('tPerson').value = String(S.tele.person);
    $('tPerson').addEventListener('change', function (ev) { S.tele.person = parseInt(ev.target.value, 10); S.tele.id = null; store('person', String(S.tele.person)); resetSession(); renderAll(); });
    $('tTodo').addEventListener('change', function (ev) { S.tele.todo = ev.target.checked; renderAll(); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', function () { resetSession(); });
    refresh().then(function () { setupPage(); if (CHAR) renderBrief(); if (CHAR && store('mode') === 'tele') setMode('tele'); });
    setInterval(function () { if (R.phase === 'idle') refresh(); }, 8000);
  }
  init();
})();
