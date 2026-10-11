import { useState } from 'react'
import { font, fontSize, radius, space, v } from '../theme/tokens'

// ง้อน้องด้วยเงิน (MOCK ล้อเล่น): กรอกรหัสซอง True Money Wallet 500 บาทแล้วน้องหายงอน
// ไม่ตรวจกับระบบจริง ไม่มีเงินเคลื่อนไหว · props เท่านั้น (app/ ส่ง onSubmit มา) · โชว์ตอน SULKING/FORGIVE เท่านั้น (app/ คุม)
// ปุ่ม/ช่องกรอกอยู่ใน .interactive เพื่อให้ popup รับคลิกได้ (FRONT_RULES §2)

export type BribePanelProps = {
  amount: number // บาท
  onSubmit: (code: string) => Promise<{ ok: boolean; message: string }>
}

export function BribePanel({ amount, onSubmit }: BribePanelProps) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const send = async () => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    // แกล้งตรวจกับ True Money ให้ดูจริงจังนิดนึง
    await new Promise((r) => setTimeout(r, 1200))
    try {
      const r = await onSubmit(code)
      setMsg({ ok: r.ok, text: r.message })
      if (r.ok) setCode('')
    } catch {
      setMsg({ ok: false, text: 'ต่อ True Money ไม่ติด (ล้อเล่น ลองใหม่)' })
    }
    setBusy(false)
  }

  const box = {
    style: {
      marginTop: space.sm,
      padding: space.sm,
      borderRadius: radius.md,
      border: `1px dashed ${v('blessed')}`,
      background: `color-mix(in srgb, ${v('bg')} 88%, transparent)`,
      color: v('text'),
      fontFamily: font.body,
      fontSize: fontSize.small,
      maxWidth: 260,
    },
  } as const

  if (!open) {
    return (
      <button className="interactive" onClick={() => setOpen(true)} style={{ ...box.style, cursor: 'pointer', textAlign: 'left', color: v('blessed') }}>
        💸 ง้อด้วยเงิน {amount} บาท (True Money)
      </button>
    )
  }

  return (
    <div className="interactive" style={box.style}>
      <div style={{ color: v('blessed'), marginBottom: space.xs }}>ใส่รหัสซองอั่งเปา True Money {amount} บาท</div>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && send()}
        placeholder="รหัสซอง / ลิงก์ซอง"
        disabled={busy}
        maxLength={200}
        autoFocus
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: `${space.xs}px ${space.sm}px`,
          background: v('surface'),
          color: v('text'),
          border: `1px solid ${v('hudDim')}`,
          borderRadius: radius.sm,
          font: 'inherit',
        }}
      />
      <div style={{ display: 'flex', gap: space.xs, marginTop: space.xs }}>
        <button
          onClick={send}
          disabled={busy}
          style={{ flex: 1, padding: `${space.xs}px`, background: v('blessed'), color: v('bg'), border: 'none', borderRadius: radius.sm, font: 'inherit', fontWeight: 700, cursor: busy ? 'default' : 'pointer' }}
        >
          {busy ? 'กำลังตรวจสอบกับ True Money…' : `จ่ายค่าไถ่ ${amount} บาท`}
        </button>
        <button onClick={() => setOpen(false)} style={{ padding: `${space.xs}px ${space.sm}px`, background: 'transparent', color: v('textDim'), border: `1px solid ${v('hudDim')}`, borderRadius: radius.sm, font: 'inherit', cursor: 'pointer' }}>
          ยกเลิก
        </button>
      </div>
      {msg && <div style={{ marginTop: space.xs, color: v(msg.ok ? 'blessed' : 'danger') }}>{msg.text}</div>}
      <div style={{ marginTop: space.xs, color: v('textDim'), fontSize: fontSize.micro }}>ล้อเล่น (mock): ไม่ได้ตัดเงินจริง รหัสไม่ถูกเก็บหรือส่งไปไหน</div>
    </div>
  )
}
