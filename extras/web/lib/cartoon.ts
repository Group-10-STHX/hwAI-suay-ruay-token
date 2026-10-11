// Simple cartoon SVG faces for SIMULATED players only (mock data). Never a real person's photo.
const h32 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** Deterministic transparent-background cartoon face from a seed (the wai id). */
export function cartoonSvg(seed: string): string {
  const n = h32(seed);
  const skin = ['#f6d2b0', '#e8b890', '#c68b5e', '#8d5a3a'][n % 4];
  const hair = ['#2b1d14', '#5a3825', '#1c1c24', '#a8552b', '#d9b04a'][(n >> 3) % 5];
  const mouth = (n >> 6) % 3; // 0 smile, 1 open, 2 flat
  const brow = (n >> 8) % 2 ? 2 : -2; // happy / stern
  const accent = `hsl(${(n >> 10) % 360} 70% 55%)`;
  const m = mouth === 0 ? '<path d="M38 70q12 12 24 0" fill="none" stroke="#3a1d12" stroke-width="3" stroke-linecap="round"/>'
    : mouth === 1 ? '<ellipse cx="50" cy="73" rx="8" ry="6" fill="#3a1d12"/>'
    : '<path d="M40 73h20" stroke="#3a1d12" stroke-width="3" stroke-linecap="round"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 130" width="400" height="520" role="img" aria-label="simulated cartoon sticker">`
    + `<path d="M8 130q2-30 42-30t42 30z" fill="${accent}"/>`
    + `<ellipse cx="50" cy="52" rx="32" ry="36" fill="${skin}"/>`
    + `<path d="M17 50q0-38 33-38t33 38q-10-18-33-18T17 50z" fill="${hair}"/>`
    + `<circle cx="38" cy="52" r="4" fill="#222"/><circle cx="62" cy="52" r="4" fill="#222"/>`
    + `<path d="M31 ${43 + brow}l14 ${-brow / 2}M55 ${43 - brow / 2}l14 ${brow}" stroke="${hair}" stroke-width="3" stroke-linecap="round"/>`
    + m + `</svg>`;
}

/** Stable pseudo-random: should this simulated passed wai have a cartoon sticker? */
export const simHasSticker = (id: string, score: number, passed: boolean) => passed && score >= 82 && h32(id) % 3 === 0;
