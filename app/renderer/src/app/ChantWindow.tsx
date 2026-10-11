import { useEffect, useMemo, useRef, useState } from 'react'
import { answerChant, closeChant, openPaliscript, subscribeChant, type ChantState } from '../api/chant'
import { ChantKaraoke, ChantOffer } from '../states'
import { fontSize, space, v } from '../theme/tokens'
import { dragBar } from './homeStyles'

// หน้าต่างสวดบาลี (ล้อเล่น) · main เปิดตอน AI แก้ไฟล์ JS · logic: poll /wai/chant, ตอบ [ฟัง], คำนวณคำที่กำลังสวดจากเวลา
// ปิดหน้าต่างด้วยปุ่ม OS ได้เสมอ (นับเป็น "ไม่ฟัง") · จบแล้วปิดเองหลัง ~3 วิ

const CLOSE_AFTER_MS = 3000

export function ChantWindow() {
  const [state, setState] = useState<ChantState>({ active: false })
  const [seen, setSeen] = useState(false)
  const [answered, setAnswered] = useState<string | undefined>()
  const [now, setNow] = useState(() => Date.now())
  const closing = useRef(false)

  useEffect(
    () =>
      subscribeChant((s) => {
        setState(s)
        if (s.active) setSeen(true)
      }),
    [],
  )

  const active = state.active ? state : undefined
  const playing = active?.phase === 'playing'

  // ตัวจับเวลาไหลลื่นระหว่างสวด (ไม่รอ poll 500ms)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    const loop = () => {
      setNow(Date.now())
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const total = useMemo(() => active?.lines.reduce((n, l) => n + l.words.length, 0) ?? 0, [active])
  const finished = active?.phase === 'done'

  let activeIndex = -1
  if (finished) activeIndex = total
  else if (playing && total > 0) {
    if (active.line !== undefined && active.lines[active.line]) {
      // เดินตามเสียงจริงทีละบรรทัด: daemon บอกบรรทัดที่กำลังสวด ในบรรทัดไฮไลต์ทีละคำตามเวลาโดยประมาณ ไม่ล้ำไปบรรทัดถัดไปก่อนเสียงจบ
      const before = active.lines.slice(0, active.line).reduce((n, l) => n + l.words.length, 0)
      const words = active.lines[active.line].words.length
      const el = Math.max(0, now - (active.lineStartedAt ?? now))
      activeIndex = before + Math.min(words - 1, Math.floor((el / (active.lineMs ?? words * 700)) * words))
    } else {
      const dur = active.durationMs ?? total * 700
      const elapsed = Math.max(0, now - (active.startedAt ?? now))
      activeIndex = Math.min(total - 1, Math.floor((elapsed / dur) * total))
    }
  }

  // จบแล้วปิดเอง · หรือเคยเห็นเซสชันแล้ว daemon เคลียร์ทิ้ง (active:false)
  useEffect(() => {
    if (closing.current) return
    if (finished || (seen && !active)) {
      closing.current = true
      const t = setTimeout(closeChant, CLOSE_AFTER_MS)
      return () => clearTimeout(t)
    }
  }, [finished, seen, active])

  const onYes = () => {
    if (!active) return
    setAnswered(active.id)
    void answerChant(true)
  }

  let body
  if (!active || active.phase === 'offer') {
    body = active ? (
      <ChantOffer file={active.file} onYes={onYes} busy={answered === active.id} />
    ) : (
      <div style={{ color: v('textDim'), fontSize: fontSize.small, textAlign: 'center', paddingTop: space.xl }}>
        {seen ? 'สาธุ 🙏' : 'รอบทสวดจาก daemon…'}
      </div>
    )
  } else {
    body = <ChantKaraoke file={active.file} lines={active.lines} activeIndex={activeIndex} finished={finished} />
  }

  return (
    <div
      className="chant-bg"
      style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: `${space.xl}px ${space.md}px ${space.xl}px`, color: v('text'), overflow: 'hidden', userSelect: 'none' }}
    >
      <div style={dragBar} />
      {body}
      <button
        className="interactive"
        onClick={() => void openPaliscript()}
        title="เปิดรีโป Paliscript"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: `${space.xs}px ${space.sm}px`, background: 'transparent', border: 'none', color: v('textDim'), fontSize: fontSize.micro, cursor: 'pointer', textAlign: 'center' }}
      >
        บทสวดจากไอเดีย Paliscript · github.com/maiaowmorseesom/sht9-paliscript · SHT๙ Hackathon ปีที่ 9
      </button>
    </div>
  )
}
