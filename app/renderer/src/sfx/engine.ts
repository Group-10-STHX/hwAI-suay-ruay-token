// WebAudio engine ขนาดเล็ก: lazy context, master gain ต่ำ, ไม่ throw
// ไม่มีไฟล์เสียง สังเคราะห์สดทั้งหมด

type Ctx = { ctx: AudioContext; master: GainNode }

let inst: Ctx | null = null
let failed = false
let muted = false
let volume = 0.18 // ค่าเริ่มต้นเบา กันตกใจ

export function setMuted(m: boolean) {
  muted = m
}
export function setVolume(v: number) {
  volume = Math.min(0.5, Math.max(0, v))
  if (inst) inst.master.gain.value = volume
}

/** คืน context ที่พร้อมเล่น หรือ null ถ้าสร้างไม่ได้/ยังถูก block */
function ready(): Ctx | null {
  if (muted || failed) return null
  try {
    if (!inst) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) {
        failed = true
        return null
      }
      const ctx = new AC()
      const master = ctx.createGain()
      master.gain.value = volume
      master.connect(ctx.destination)
      inst = { ctx, master }
    }
    if (inst.ctx.state === 'suspended') {
      // popup ไม่มี user gesture: ลอง resume เงียบๆ ถ้าไม่ได้ก็ข้ามเสียงนี้
      void inst.ctx.resume().catch(() => {})
      if (inst.ctx.state === 'suspended') return null
    }
    return inst
  } catch {
    failed = true
    return null
  }
}

export type ToneOpts = {
  freq: number
  to?: number // glide ไปความถี่นี้
  dur: number // วินาที
  type?: OscillatorType
  gain?: number
  delay?: number // วินาที
  attack?: number
}

export function tone(o: ToneOpts) {
  const c = ready()
  if (!c) return
  try {
    const { ctx, master } = c
    const t0 = ctx.currentTime + (o.delay ?? 0)
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = o.type ?? 'square'
    osc.frequency.setValueAtTime(o.freq, t0)
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur)
    const peak = o.gain ?? 0.5
    const a = o.attack ?? 0.005
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(peak, t0 + a)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
    osc.connect(g).connect(master)
    osc.start(t0)
    osc.stop(t0 + o.dur + 0.02)
  } catch {
    /* เสียงเป็นของแถม ห้ามพัง UI */
  }
}

export function noise(o: { dur: number; gain?: number; freq?: number; delay?: number }) {
  const c = ready()
  if (!c) return
  try {
    const { ctx, master } = c
    const t0 = ctx.currentTime + (o.delay ?? 0)
    const n = Math.max(1, Math.floor(ctx.sampleRate * o.dur))
    const buf = ctx.createBuffer(1, n, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = o.freq ?? 2400
    const g = ctx.createGain()
    g.gain.setValueAtTime(o.gain ?? 0.3, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
    src.connect(f).connect(g).connect(master)
    src.start(t0)
  } catch {
    /* ignore */
  }
}

/** เล่นโน้ตเรียงกัน (arpeggio) */
export function arp(freqs: number[], step: number, o: Omit<ToneOpts, 'freq' | 'delay'>) {
  freqs.forEach((freq, i) => tone({ ...o, freq, delay: i * step }))
}
