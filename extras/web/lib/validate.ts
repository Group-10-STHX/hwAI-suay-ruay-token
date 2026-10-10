// Strict validation for daemon writes. Unknown fields are rejected so nothing private
// (prompt text, agent_label, file paths) can be uploaded by accident.
import type { WaiSubmission } from './types';
import { ApiError } from './errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const HANDLE = /^[a-z0-9_]{3,20}$/;
const KEYS = ['id', 'session_id', 'source', 'kind', 'level', 'score', 'hold_ms', 'passed', 'action', 'forgave', 'anger', 'client_ts'];

function bad(message: string, field?: string): never {
  throw new ApiError(400, 'invalid_body', message, field);
}
const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

export function validateWai(body: unknown, now = Date.now()): WaiSubmission {
  if (!body || typeof body !== 'object' || Array.isArray(body)) bad('body must be a JSON object');
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b)) if (!KEYS.includes(k)) bad(`unknown field "${k}"`, k);
  if (typeof b.id !== 'string' || !UUID.test(b.id)) bad('id must be a uuid', 'id');
  if (typeof b.session_id !== 'string' || !b.session_id || b.session_id.length > 64) bad('session_id must be 1–64 chars', 'session_id');
  if (!['claude_code', 'shell', 'extension'].includes(b.source as string)) bad('source must be claude_code | shell | extension', 'source');
  if (!['prompt', 'subagent'].includes(b.kind as string)) bad('kind must be prompt | subagent', 'kind');
  if (!isInt(b.level, 0, 3)) bad('level must be an integer 0–3', 'level');
  if (!isInt(b.score, 0, 100)) bad('score must be an integer 0–100', 'score');
  if (!isInt(b.hold_ms, 0, 60_000)) bad('hold_ms must be an integer 0–60000', 'hold_ms');
  if (typeof b.passed !== 'boolean') bad('passed must be boolean', 'passed');
  if (!['allow', 'retry', 'deny', 'rage_quit'].includes(b.action as string)) bad('action must be allow | retry | deny | rage_quit', 'action');
  const forgave = b.forgave === undefined ? false : b.forgave;
  if (typeof forgave !== 'boolean') bad('forgave must be boolean', 'forgave');
  const anger = b.anger === undefined ? 0 : b.anger;
  if (!isInt(anger, 0, 6)) bad('anger must be an integer 0–6', 'anger');
  if (typeof b.client_ts !== 'string' || Number.isNaN(Date.parse(b.client_ts))) bad('client_ts must be an ISO-8601 timestamp', 'client_ts');
  if (Math.abs(Date.parse(b.client_ts as string) - now) > 86_400_000) bad('client_ts must be within ±24h of server time', 'client_ts');
  if (b.passed && !((b.level as number) >= 1 && (b.hold_ms as number) >= 1000 && b.action === 'allow'))
    bad('passed requires level ≥ 1, hold_ms ≥ 1000 and action = "allow"', 'passed');
  if (!b.passed && b.action === 'allow') bad('action "allow" requires passed = true', 'action');
  if (forgave && !(b.passed && b.level === 3)) bad('forgave requires passed = true and level = 3', 'forgave');
  return {
    id: (b.id as string).toLowerCase(), session_id: b.session_id as string, source: b.source as WaiSubmission['source'],
    kind: b.kind as WaiSubmission['kind'], level: b.level as WaiSubmission['level'], score: b.score as number,
    hold_ms: b.hold_ms as number, passed: b.passed as boolean, action: b.action as WaiSubmission['action'],
    forgave: forgave as boolean, anger: anger as number, client_ts: b.client_ts as string,
  };
}

export function validateRegister(body: unknown): { handle: string; display_name: string } {
  if (!body || typeof body !== 'object') bad('body must be a JSON object');
  const b = body as Record<string, unknown>;
  for (const k of Object.keys(b)) if (k !== 'handle' && k !== 'display_name') bad(`unknown field "${k}"`, k);
  if (typeof b.handle !== 'string' || !HANDLE.test(b.handle)) bad('handle must match ^[a-z0-9_]{3,20}$', 'handle');
  if (b.handle === 'me') bad('handle is reserved', 'handle');
  const name = typeof b.display_name === 'string' ? b.display_name.trim() : '';
  if (name.length < 1 || [...name].length > 32) bad('display_name must be 1–32 characters', 'display_name');
  return { handle: b.handle, display_name: name };
}

export function validatePatch(body: unknown): { display_name?: string; avatar_hue?: number } {
  if (!body || typeof body !== 'object') bad('body must be a JSON object');
  const b = body as Record<string, unknown>, out: { display_name?: string; avatar_hue?: number } = {};
  for (const k of Object.keys(b)) if (k !== 'display_name' && k !== 'avatar_hue') bad(`unknown field "${k}"`, k);
  if (b.display_name !== undefined) {
    const name = typeof b.display_name === 'string' ? b.display_name.trim() : '';
    if (name.length < 1 || [...name].length > 32) bad('display_name must be 1–32 characters', 'display_name');
    out.display_name = name;
  }
  if (b.avatar_hue !== undefined) {
    if (!isInt(b.avatar_hue, 0, 359)) bad('avatar_hue must be an integer 0–359', 'avatar_hue');
    out.avatar_hue = b.avatar_hue as number;
  }
  return out;
}

/** Same submission replayed? Compare the fields the server stores. */
export function sameWai(a: WaiSubmission, b: WaiSubmission): boolean {
  return KEYS.every((k) => k === 'client_ts'
    ? Date.parse(a.client_ts) === Date.parse(b.client_ts)
    : (a as unknown as Record<string, unknown>)[k] === (b as unknown as Record<string, unknown>)[k]);
}
