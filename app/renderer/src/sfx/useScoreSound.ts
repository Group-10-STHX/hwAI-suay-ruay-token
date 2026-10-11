import { useEffect, useRef } from 'react'
import type { SessionState, VisionEvent } from '../api/types'
import { decideSounds, initialMemory, snapshotOf, type SfxLevel, type SfxMemory, type SfxSnapshot } from './policy'
import { playSound } from './sounds'

type Args = { state: SessionState; vision: VisionEvent; level: SfxLevel }

/** ติดที่ window เดียว (Avatar) เล่นเสียงตาม policy ทุกครั้งที่ state/vision เปลี่ยน */
export function useScoreSound({ state, vision, level }: Args) {
  const prev = useRef<SfxSnapshot | null>(null)
  const mem = useRef<SfxMemory>(initialMemory)
  const latest = useRef({ state, vision, level })
  latest.current = { state, vision, level }

  const run = () => {
    const { state: s, vision: v, level: l } = latest.current
    const next = snapshotOf(s, v)
    const r = decideSounds(prev.current, next, l, Date.now(), mem.current)
    prev.current = next
    mem.current = r.memory
    r.sounds.forEach(playSound)
  }

  useEffect(run, [state, vision, level])

  // นับวินาที WATCHING แม้ vision ไม่ส่ง event ใหม่
  useEffect(() => {
    if (level !== 'many' || state !== 'WATCHING') return
    const id = window.setInterval(run, 500)
    return () => window.clearInterval(id)
  }, [level, state])
}
