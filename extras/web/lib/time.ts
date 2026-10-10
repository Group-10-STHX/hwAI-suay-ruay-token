// All windows are Asia/Bangkok (UTC+7, no DST).
import type { Period } from './types';

export const DAY = 86_400_000;
export const BKK = 7 * 3_600_000;

export function startOf(period: Period, t: number): number {
  if (period === 'all') return -Infinity;
  const d = new Date(t + BKK);
  d.setUTCHours(0, 0, 0, 0);
  if (period === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  else if (period === 'month') d.setUTCDate(1);
  return d.getTime() - BKK;
}

/** Integer Bangkok day number. */
export const bkkDay = (t: number) => Math.floor((t + BKK) / DAY);
export const dayStr = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
export const iso = (t: number) => new Date(t).toISOString();
export const isoOrNull = (t: number) => (Number.isFinite(t) ? iso(t) : null);

export function isoWeek(t: number): string {
  const d = new Date(bkkDay(t) * DAY);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const y = d.getUTCFullYear();
  const wk = Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / DAY + 1) / 7);
  return `${y}-W${String(wk).padStart(2, '0')}`;
}

/** Next Bangkok midnight — the "next human assessment" countdown target. */
export const nextMidnight = (t: number) => startOf('day', t) + DAY;
