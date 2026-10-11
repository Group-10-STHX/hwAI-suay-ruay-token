import { useState } from 'react'
import { font, fontSize, radius, space, v } from '../theme/tokens'

// ค่าไถ่ True Money (MOCK ล้อเล่น · อีเวนต์ tribute): หน้าต่างแยก โชว์ภาพบัตร + ช่องกรอกเลขบัตร
// ไม่ตรวจกับระบบจริง ไม่เก็บ/ไม่ log/ไม่ส่งเลขไปไหน (ค้างแค่ใน state ของช่องกรอก ล้างเมื่อ unmount/สำเร็จ)
// props เท่านั้น (app/ ส่ง onSubmit, cardSrc มา) · สีจาก tokens.ts เท่านั้น

export type TributePanelProps = {
  amount: number // บาท
  text?: string // ข้อความที่น้องพูด (จาก event) ไม่ส่ง = ข้อความมาตรฐาน
  cardSrc: string // รูปบัตร (app/ import asset มาให้)
  onSubmit: (code: string) => Promise<{ ok: boolean; message: string }>
  onDismiss?: () => void // "ขอเวลาไปหาเงินก่อน" (แค่ปิดหน้าต่าง คำขอยังรออยู่)
}

const MAX_DIGITS = 16
const CHECK_MS = 1200

/** เหลือแต่ตัวเลข (กรอกเว้นวรรค/ขีดได้) แล้วจัดกลุ่มละ 4 ให้อ่านง่าย */
export function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, MAX_DIGITS)
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ')
}

export function TributePanel({ amount, text, cardSrc, onSubmit, onDismiss }: TributePanelProps) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const digits = code.replace(/\D/g, '')

  const send = async () => {
    if (busy || digits.length === 0) return
    setBusy(true)
    setMsg(null)
    // แกล้งตรวจกับ True Money ให้ดูจริงจังนิดนึง
    await new Promise((r) => setTimeout(r, CHECK_MS))
    try {
      const r = await onSubmit(digits)
      setMsg({ ok: r.ok, text: r.message })
      setCode('')
    } catch {
      setMsg({ ok: false, text: 'ต่อ True Money ไม่ติด (ล้อเล่น ลองใหม่)' })
    }
    setBusy(false)
  }

  return (
    <div style={{ display: 'grid', gap: space.md, fontFamily: font.body, color: v('text') }}>
      <div className="display" style={{ fontSize: fontSize.body + 2, color: v('hud'), lineHeight: 1.4 }}>
        {text ?? `เชื่อกู รำคาญมึงว่ะ มึงต้องจ่าย True Money ${amount.toLocaleString('en-US')} บาทก่อนให้กู`}
      </div>

      <img
        src={cardSrc}
        alt={`บัตร True Money ${amount} บาท`}
        draggable={false}
        style={{ width: '100%', maxWidth: 340, justifySelf: 'center', borderRadius: radius.lg, border: `1px solid ${v('hudDim')}` }}
      />

      <div style={{ display: 'grid', gap: space.xs }}>
        <label htmlFor="tribute-card" style={{ fontSize: fontSize.small, color: v('textDim') }}>
          เลขบัตรเติมเงิน True Money {amount.toLocaleString('en-US')} บาท
        </label>
        <input
          id="tribute-card"
          className="mono"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(formatCardNumber(e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="0000 0000 0000 0000"
          disabled={busy}
          maxLength={24}
          autoFocus
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: `${space.sm}px ${space.md}px`,
            background: v('surface'),
            color: v('text'),
            border: `1px solid ${v('hudDim')}`,
            borderRadius: radius.md,
            fontSize: fontSize.body + 2,
            letterSpacing: 2,
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: space.sm }}>
        <button
          onClick={send}
          disabled={busy || digits.length === 0}
          style={{
            flex: 1,
            padding: `${space.sm + 2}px ${space.md}px`,
            background: v('blessed'),
            color: v('bg'),
            border: 'none',
            borderRadius: radius.md,
            font: 'inherit',
            fontWeight: 700,
            cursor: busy || digits.length === 0 ? 'default' : 'pointer',
            opacity: busy || digits.length === 0 ? 0.6 : 1,
          }}
        >
          {busy ? 'กำลังตรวจสอบกับ True Money…' : `จ่ายค่าไถ่ ${amount.toLocaleString('en-US')} บาท`}
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{ padding: `${space.sm}px ${space.md}px`, background: 'transparent', color: v('textDim'), border: `1px solid ${v('hudDim')}`, borderRadius: radius.md, font: 'inherit', cursor: 'pointer' }}
          >
            ขอเวลาไปหาเงินก่อน
          </button>
        )}
      </div>

      {msg && (
        <div role="status" style={{ color: v(msg.ok ? 'blessed' : 'danger') }}>
          {msg.text}
        </div>
      )}

      <div style={{ padding: space.sm, border: `1px dashed ${v('blessed')}`, borderRadius: radius.md, color: v('blessed'), fontSize: fontSize.small, lineHeight: 1.5 }}>
        ล้อเล่น (mock) ไม่ได้ตัดเงินจริง ห้ามใส่เลขบัตรจริง · เลขไม่ถูกตรวจ ไม่ถูกเก็บ ไม่ถูก log และไม่ถูกส่งไปไหน
      </div>
    </div>
  )
}
