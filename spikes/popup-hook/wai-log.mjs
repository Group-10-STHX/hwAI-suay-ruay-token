// wai-log: local wai record (<home>/wais.jsonl) + in-memory stats + optional upload via wai-sync.
// Contract: docs/wai-data-contract.md sections 2 and 3.
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWaiSync } from '../../extras/web/sdk/wai-sync.mjs';

export const BEAUTIFUL_SCORE = 80;

export function tokensFor({ passed, level, score }) {
  return passed ? (Number(level) || 0) * 10 + (Number(score) >= BEAUTIFUL_SCORE ? 20 : 0) : 0;
}

export function awardsFor({ passed, level, score, style }) {
  const out = [];
  if (!passed) return out;
  if (Number(score) >= BEAUTIFUL_SCORE) out.push('beautiful');
  if (Number(level) === 3) out.push('monk');
  if (style === 'weird') out.push('weird');
  return out;
}

const bangkokDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const zero = () => ({ wais: 0, passed: 0, beautiful: 0, tokens: 0 });

export function createWaiLog({ home, sync = true, now = () => new Date(), logger = console } = {}) {
  const file = join(home, 'wais.jsonl');
  const total = zero();
  const byDay = new Map();
  let best = 0;

  const add = (r) => {
    const day = bangkokDay(r.at);
    if (!byDay.has(day)) byDay.set(day, zero());
    for (const t of [total, byDay.get(day)]) {
      t.wais++;
      if (r.passed) t.passed++;
      if (r.passed && r.score >= BEAUTIFUL_SCORE) t.beautiful++;
      t.tokens += Number(r.tokens) || 0;
    }
    if (r.score > best) best = r.score;
  };

  try {
    if (existsSync(file)) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const r = JSON.parse(line);
          if (r && typeof r === 'object' && r.at && !Number.isNaN(new Date(r.at).getTime())) {
            r.score = Number(r.score) || 0;
            add(r);
          }
        } catch { /* skip broken line */ }
      }
    }
  } catch (e) { logger.warn?.('[wai-log] load failed', e?.message || e); }

  let waiSync = null;
  if (sync) {
    try { waiSync = createWaiSync({ home }); } catch (e) { logger.warn?.('[wai-log] sync init failed', e?.message || e); }
  }

  function record(a = {}) {
    try {
      const passed = !!a.passed;
      const level = Number(a.level) || 0;
      const score = Number(a.score) || 0;
      const style = a.style || 'normal';
      const rec = {
        v: 1, id: randomUUID(), at: new Date(now()).toISOString(),
        session_id: a.session_id ?? 'unknown', source: a.source ?? 'claude_code', kind: a.kind ?? 'prompt',
        agent_label: a.agent_label ?? null,
        passed, action: a.action ?? (passed ? 'allow' : 'retry'),
        level, score, hold_ms: Number(a.hold_ms ?? a.holdMs) || 0,
        parts: a.parts ?? null, attempts: a.attempts ?? 0, style,
        state: a.state ?? null, anger: Number(a.anger) || 0, forgave: !!a.forgave,
        awards: awardsFor({ passed, level, score, style }),
        tokens: tokensFor({ passed, level, score }),
      };
      add(rec); // stats stay right even if the disk write fails
      try {
        mkdirSync(home, { recursive: true });
        appendFileSync(file, JSON.stringify(rec) + '\n');
      } catch (e) { logger.warn?.('[wai-log] write failed', e?.message || e); }
      if (waiSync) {
        try {
          waiSync.record({
            id: rec.id, session_id: rec.session_id, source: rec.source, kind: rec.kind,
            passed, level, score, hold_ms: rec.hold_ms, action: rec.action,
            anger: rec.anger, forgave: rec.forgave, at: rec.at,
          });
        } catch (e) { logger.warn?.('[wai-log] sync failed', e?.message || e); }
      }
      return rec;
    } catch (e) {
      try { logger.warn?.('[wai-log] record failed', e?.message || e); } catch {}
      return null;
    }
  }

  const stats = () => ({
    today: { ...(byDay.get(bangkokDay(now())) || zero()) },
    total: { ...total },
    best_score: best,
  });

  return {
    record, stats,
    flush: () => (waiSync ? waiSync.flush() : Promise.resolve({ sent: 0, kept: 0 })),
    stop: () => { try { waiSync?.stop(); } catch {} },
  };
}
