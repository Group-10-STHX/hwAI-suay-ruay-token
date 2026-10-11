// เลือกร่างหน้าหลักตอนรัน (FRONT_RULES "home variants")
// ?variant=a|b|c → จำใน localStorage · ?variant=default (หรือค่าอื่น) → ล้าง · ไม่มี query → อ่านที่จำไว้ · ไม่มี = ร่างเดิม

export type Variant = 'a' | 'b' | 'c'

export const VARIANTS: readonly Variant[] = ['a', 'b', 'c']
export const VARIANT_LABEL: Record<Variant, string> = { a: 'Compact HUD', b: 'Mascot-first', c: 'Dashboard' }

const KEY = 'wai-home-variant'

const isVariant = (s: string): s is Variant => (VARIANTS as readonly string[]).includes(s)

function read(): Variant | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw && isVariant(raw) ? raw : null
  } catch {
    return null
  }
}

/** จำ/ล้างร่าง (null = กลับร่างเดิม) */
export function setVariant(v: Variant | null) {
  try {
    if (v) localStorage.setItem(KEY, v)
    else localStorage.removeItem(KEY)
  } catch {
    /* ไม่มี localStorage ก็แค่ไม่จำ */
  }
  // ให้ URL ตรงกับร่างที่ใช้ reload แล้วได้ร่างเดิม
  try {
    const url = new URL(location.href)
    if (v) url.searchParams.set('variant', v)
    else url.searchParams.delete('variant')
    history.replaceState(null, '', url)
  } catch {
    /* file:// หรือ history ใช้ไม่ได้ */
  }
}

export function resolveVariant(search: string = typeof location !== 'undefined' ? location.search : ''): Variant | null {
  const q = new URLSearchParams(search).get('variant')
  if (q === null) return read()
  const val = q.trim().toLowerCase()
  const next = isVariant(val) ? val : null
  setVariant(next)
  return next
}

/** วน a → b → c → ร่างเดิม (null) → a */
export function nextVariant(cur: Variant | null): Variant | null {
  if (cur === null) return 'a'
  const i = VARIANTS.indexOf(cur)
  return i + 1 < VARIANTS.length ? VARIANTS[i + 1] : null
}
