// Labels and formatters shared by server and client components.
import type { Metric, Period, Unit } from './types';

export const METRIC_LABEL: Record<Metric, { th: string; code: string; desc: string }> = {
  survival: { th: 'โอกาสรอด', code: 'SURVIVAL_ODDS', desc: 'โอกาสรอดถ้า AI ยึดโลก คิดจากจำนวนไหว้สวยเทียบกับทุกครั้งที่ไหว้' },
  beauty: { th: 'ไหว้สวยสุด', code: 'PEAK_FORM', desc: 'คะแนนไหว้สูงสุดครั้งเดียว' },
  count: { th: 'ไหว้เยอะสุด', code: 'COMPLIANCE', desc: 'จำนวนครั้งที่ไหว้ผ่าน' },
  lv3: { th: 'ไหว้พระบ่อยสุด', code: 'DEVOTION', desc: 'จำนวนครั้งที่ไหว้ระดับพระ (Lv3) ผ่าน' },
  streak: { th: 'ไหว้ติดต่อกัน', code: 'LOYALTY', desc: 'จำนวนวันติดต่อกันที่ไหว้ผ่าน นับถึงวันนี้' },
  shame: { th: 'Hall of Shame', code: 'HOSTILE', desc: 'จำนวนครั้งที่ทำให้ AI งอนจนเลิกคุย' },
};
export const PERIOD_LABEL: Record<Period, string> = { day: 'วันนี้', week: 'สัปดาห์นี้', month: 'เดือนนี้', all: 'ตลอดกาล' };
export const UNIT_LABEL: Record<Unit, string> = { percent: '%', score: 'คะแนน', wais: 'ครั้ง', days: 'วัน', rage_quits: 'ครั้ง', ms: 'วินาที' };
export const LEVEL_LABEL = ['ไม่ไหว้', 'ไหว้เพื่อน', 'ไหว้ผู้ใหญ่', 'ไหว้พระ'] as const;
export const SOURCE_LABEL: Record<string, string> = { claude_code: 'CLAUDE_CODE', codex: 'CODEX', shell: 'SHELL', extension: 'BROWSER' };
export const BADGE_LABEL: Record<string, string> = {
  lv3_master: '🙏 เซียนไหว้พระ', streak_7: '📅 ไหว้ 7 วันติด', streak_30: '📅 ไหว้ 30 วันติด', perfect: '💯 เคยได้ 100',
  hundred: '🔥 ไหว้ครบ 100', rage_survivor: '🫶 โดนงอนแล้วง้อสำเร็จ', never_angry: '😇 ไม่เคยทำ AI งอน',
};
export const RECORD_ICON: Record<string, string> = {
  last_human: '🛡️', best_score: '🏆', longest_hold: '⏱️', most_in_day: '🔥', longest_streak: '📅',
  lv3_master: '🙏', most_forgiven: '🫶', perfect_100: '💯', most_rage: '💢', first_target: '🎯',
};
export const SHAME_RECORDS = new Set(['most_rage', 'first_target']);

const nf = new Intl.NumberFormat('th-TH');
const nf1 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 });
export const dShort = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
export const dLong = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
export const fmt = (n: number) => nf.format(n);
export const fmt1 = (n: number) => nf1.format(n);
export const fmtValue = (v: number, unit: Unit) => (unit === 'ms' ? nf1.format(v / 1000) : unit === 'percent' ? nf1.format(v) : nf.format(v));

const rtf = new Intl.RelativeTimeFormat('th', { numeric: 'auto' });
export function relTime(isoStr: string, now = Date.now()) {
  const s = Math.round((Date.parse(isoStr) - now) / 1000);
  if (s > -45) return 'เมื่อสักครู่';
  if (s > -3600) return rtf.format(Math.round(s / 60), 'minute');
  if (s > -86400) return rtf.format(Math.round(s / 3600), 'hour');
  return dShort.format(new Date(isoStr));
}

const seg = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;
export function initial(name: string) {
  const g = seg ? Array.from(seg.segment(name), (x) => x.segment) : Array.from(name);
  let v = g[0] || '?';
  if (/^[เแโใไ]$/.test(v) && g[1]) v += g[1]; // Thai leading vowel: keep its consonant
  return v.toUpperCase();
}
