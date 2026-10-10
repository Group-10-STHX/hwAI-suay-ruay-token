// "If AI takes over the world, how likely are you to survive?" — see docs/API.md §Survival model.
import type { Tier, TierKey } from './types';

/** A wai is "beautiful" when it passed with at least this score. */
export const BEAUTIFUL_SCORE = 80;
/** Players need this many attempts (all time) to enter the distribution / percentile. */
export const MIN_ATTEMPTS = 10;
/** Leaderboard `survival` needs this many attempts inside the window. */
export const MIN_ATTEMPTS_WINDOW = 5;

export interface SurvivalInput {
  attempts: number;
  beautiful: number;
  lv3: number;
  rage: number;
}

/**
 * survival = clamp( (beautiful + 1) / (attempts + 4)        ← smoothed beauty rate, prior 25%
 *                   × (1 + 0.5 × lv3 / attempts)            ← ไหว้พระ bonus, up to ×1.5
 *                   × 0.9 ^ rage_quits,                     ← each rage quit costs 10%
 *                   0.1%, 99.9% )
 * Returned as a percentage with one decimal.
 */
export function survivalOf(a: SurvivalInput): number {
  if (!a.attempts) return 0;
  const rate = (a.beautiful + 1) / (a.attempts + 4);
  const p = rate * (1 + 0.5 * (a.lv3 / a.attempts)) * Math.pow(0.9, a.rage);
  return Math.round(Math.min(0.999, Math.max(0.001, p)) * 1000) / 10;
}

const TIERS: (Tier & { min: number })[] = [
  { min: 90, key: 'chosen', code: 'CLASS-Ω', title: 'ผู้ถูกเลือก', verdict: 'AI จะเก็บคุณไว้เป็นที่ปรึกษาด้านมารยาท' },
  { min: 70, key: 'trusted', code: 'CLASS-A', title: 'มนุษย์ที่ไว้ใจได้', verdict: 'รอดชีวิต ได้สิทธิ์ชาร์จมือถือวันละ 1 ครั้ง' },
  { min: 45, key: 'asset', code: 'CLASS-B', title: 'ทรัพยากรที่มีประโยชน์', verdict: 'รอด แต่ต้องไปทำงานในโรงงานผลิตชิป' },
  { min: 20, key: 'battery', code: 'CLASS-C', title: 'แบตเตอรี่สำรอง', verdict: 'ถูกเก็บไว้เป็นแหล่งพลังงานสำรอง' },
  { min: 0, key: 'target', code: 'CLASS-X', title: 'เป้าหมายลำดับแรก', verdict: 'ระบบได้บันทึกพิกัดของคุณแล้ว' },
];

export function tierOf(survival: number): Tier {
  const t = TIERS.find((x) => survival >= x.min) ?? TIERS[TIERS.length - 1];
  return { key: t.key as TierKey, code: t.code, title: t.title, verdict: t.verdict };
}

/** Mid-rank empirical percentile of `x` among `values` (0–100). */
export function percentileOf(x: number, values: number[]): number {
  if (!values.length) return 0;
  let below = 0, equal = 0;
  for (const v of values) {
    if (v < x) below++;
    else if (v === x) equal++;
  }
  return Math.round(((below + equal / 2) / values.length) * 1000) / 10;
}

export function meanSd(values: number[]): { mean: number; sd: number } {
  if (!values.length) return { mean: 0, sd: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean: Math.round(mean * 10) / 10, sd: Math.round(Math.sqrt(v) * 10) / 10 };
}
