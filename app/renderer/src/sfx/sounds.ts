// เสียงแบบ HUD / terminal ดิสโทเปีย (ไม่น่ารัก) ทั้งหมดสังเคราะห์
import { arp, noise, tone } from './engine'
import type { SoundName } from './policy'

const play: Record<SoundName, () => void> = {
  // คะแนนขยับ: คลิกสั้นๆ
  tick: () => tone({ freq: 1500, to: 1100, dur: 0.035, type: 'square', gain: 0.25 }),
  // นับวินาทีตอน WATCHING: เบามาก
  tickQuiet: () => tone({ freq: 700, dur: 0.03, type: 'triangle', gain: 0.12 }),
  // level ขึ้น: สองโน้ตขึ้น
  levelUp: () => arp([660, 990], 0.07, { dur: 0.1, type: 'square', gain: 0.3 }),
  // ไหว้ผ่าน: เสียงทองสั้นๆ (ไตรแอดขึ้น + ระฆัง)
  pass: () => {
    arp([784, 988, 1319], 0.07, { dur: 0.35, type: 'triangle', gain: 0.4 })
    tone({ freq: 2637, dur: 0.5, type: 'sine', gain: 0.15, delay: 0.14 })
  },
  // ไม่ผ่าน: buzz
  fail: () => {
    tone({ freq: 150, to: 110, dur: 0.28, type: 'sawtooth', gain: 0.4 })
    tone({ freq: 157, to: 115, dur: 0.28, type: 'square', gain: 0.2 })
  },
  // rage: สัญญาณเตือนต่ำ วนสองรอบ
  rage: () => {
    for (let i = 0; i < 2; i++) {
      tone({ freq: 220, to: 140, dur: 0.4, type: 'sawtooth', gain: 0.45, delay: i * 0.5 })
      tone({ freq: 110, dur: 0.4, type: 'square', gain: 0.25, delay: i * 0.5 })
    }
  },
  // forgive: คอร์ดนุ่ม
  forgive: () => {
    const g = 0.2
    tone({ freq: 392, dur: 0.9, type: 'sine', gain: g, attack: 0.08 })
    tone({ freq: 494, dur: 0.9, type: 'sine', gain: g, attack: 0.08 })
    tone({ freq: 587, dur: 0.9, type: 'sine', gain: g, attack: 0.08 })
  },
  // คำขอใหม่: sweep ขึ้น + ก๊อบ
  scanOn: () => {
    tone({ freq: 180, to: 1400, dur: 0.22, type: 'sawtooth', gain: 0.25 })
    noise({ dur: 0.06, gain: 0.12, freq: 4000, delay: 0.2 })
  },
  // CRT static blip
  static: () => noise({ dur: 0.07, gain: 0.22, freq: 3000 }),
}

export function playSound(name: SoundName) {
  try {
    play[name]()
  } catch {
    /* ignore */
  }
}
