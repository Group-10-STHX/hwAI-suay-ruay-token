import { useEffect, useMemo, useRef } from 'react'
import { fontSize, space, v } from '../theme/tokens'
import './chant.css'

// มุมมองคาราโอเกะ: บทสวดบาลี (อักษรไทย) ทีละคำ + คำอ่านใต้คำ · props เท่านั้น
// activeIndex = ลำดับคำ (นับต่อกันทุกบรรทัด) ที่กำลังสวด · -1 ยังไม่เริ่ม · >= จำนวนคำทั้งหมด = จบ

export type ChantKaraokeWord = { src: string; th: string; rom?: string }
export type ChantKaraokeLine = { src: string; words: ChantKaraokeWord[] }
export type ChantKaraokeProps = {
  file: string
  lines: ChantKaraokeLine[]
  activeIndex: number
  finished: boolean
}

export function ChantKaraoke({ file, lines, activeIndex, finished }: ChantKaraokeProps) {
  const starts = useMemo(() => {
    let n = 0
    return lines.map((l) => {
      const s = n
      n += l.words.length
      return s
    })
  }, [lines])
  const activeLine = starts.reduce((acc, s, i) => (activeIndex >= s ? i : acc), 0)
  const refs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const el = refs.current[activeLine]
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  }, [activeLine, finished])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ textAlign: 'center', padding: `${space.sm}px 0` }}>
        <span className="chant-sway" style={{ fontSize: 34 }} aria-hidden>
          🔔
        </span>
        <div className="mono" style={{ color: v('textDim'), fontSize: fontSize.micro }}>
          สวดบทแก้ไข {file}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'grid', gap: space.lg, alignContent: 'start', padding: `${space.lg}px ${space.sm}px` }}>
        {lines.map((line, li) => {
          const isCur = li === activeLine && !finished
          return (
            <div key={li} ref={(el) => { refs.current[li] = el }} style={{ textAlign: 'center', opacity: finished || isCur || li < activeLine ? 1 : 0.55 }}>
              <div className="mono" style={{ color: v('textDim'), fontSize: fontSize.micro, opacity: 0.8, marginBottom: space.xs, wordBreak: 'break-all' }}>
                {line.src}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: `${space.xs}px ${space.md}px`, lineHeight: 1.25 }}>
                {line.words.map((w, wi) => {
                  const gi = starts[li] + wi
                  const cur = gi === activeIndex && !finished
                  const past = finished || gi < activeIndex
                  return (
                    <span
                      key={wi}
                      className="chant-word"
                      style={{
                        display: 'inline-flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        color: cur || past ? v('blessed') : v('text'),
                        opacity: past || cur ? 1 : 0.75,
                        transform: cur ? 'scale(1.18)' : 'none',
                        textShadow: cur ? `0 0 14px ${v('blessed')}` : 'none',
                      }}
                    >
                      <span style={{ fontSize: fontSize.speech, fontWeight: 700 }}>{w.th}</span>
                      {w.rom && <span style={{ fontSize: fontSize.small, color: cur ? v('blessed') : v('textDim') }}>{w.rom}</span>}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
        {finished && (
          <div style={{ textAlign: 'center', fontSize: fontSize.score, fontWeight: 700, color: v('blessed'), paddingTop: space.md }}>สาธุ 🙏</div>
        )}
      </div>
    </div>
  )
}
