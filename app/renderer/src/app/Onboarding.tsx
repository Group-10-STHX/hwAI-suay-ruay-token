import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { openCodexHooks, setup, type HookTool, type SetupStatus } from '../api'
import { fontSize, space, v } from '../theme/tokens'
import { dragBar, ghostButton, page, panel, row } from './homeStyles'

// onboarding ตอนเปิดแอปครั้งแรก (แบบ vorssaint-utils: ให้ผู้ใช้เลือกเอง ขอสิทธิ์เท่าที่ใช้)
// ต้อนรับ → กล้อง → ต่อ AI → เปิดตอนเข้าเครื่อง

const STEPS = ['ต้อนรับ', 'กล้อง', 'ต่อ AI', 'เสร็จ'] as const

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [s, setS] = useState<SetupStatus | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setup
      .status()
      .then(setS)
      .catch((e) => setError(String(e.message ?? e)))
  }, [])
  useEffect(refresh, [refresh])

  const toggleHook = async (tool: HookTool, on: boolean) => {
    const r = await setup.hooks(tool, on)
    setMsg(r.ok ? (on ? `ติดแล้ว: ${r.file}` : `ถอดแล้ว: ${r.file}`) : r.error ?? 'ไม่สำเร็จ')
    refresh()
  }

  const finish = async () => {
    await setup.onboarded(true)
    onDone()
  }

  if (error) return <Shell step={-1}><p style={{ color: v('hud') }}>{error}</p></Shell>
  if (!s) return <Shell step={-1}><p style={{ color: v('textDim') }}>กำลังโหลด…</p></Shell>

  const next = (
    <button onClick={() => { setMsg(null); setStep(step + 1) }} style={{ ...panel, borderColor: v('hud'), cursor: 'pointer', textAlign: 'center' }}>
      ต่อไป ▶
    </button>
  )

  return (
    <Shell step={step} onBack={step > 0 ? () => { setMsg(null); setStep(step - 1) } : undefined}>
      {step === 0 && (
        <>
          <Title>มนุษย์ ก่อนใช้ AI ต้องไหว้กูก่อน</Title>
          <p style={{ color: v('textDim'), margin: 0 }}>
            ทุกครั้งที่ส่ง prompt หรือ AI แตก subagent ต้องไหว้กล้องให้สวยก่อน AI ถึงจะทำงาน ภาพจากกล้องประมวลผลในเครื่อง ไม่ส่งออกไปไหน
          </p>
          <div style={{ ...panel, padding: space.md }}>
            <div className="mono" style={{ color: v('textDim'), fontSize: fontSize.small }}>แอปจะแก้ไฟล์เหล่านี้ (ตอนนายติ๊กเท่านั้น)</div>
            <ul style={{ margin: `${space.sm}px 0 0`, paddingLeft: space.lg, color: v('text') }}>
              <li>hook ของ Claude Code / Codex ใน <b>{s.folder}</b></li>
              <li>backup ไฟล์เดิมเป็น <span className="mono">.wai.bak</span> ก่อนแก้ ถอดออกได้ทุกเมื่อ</li>
            </ul>
            {s.scope === 'sandbox' && (
              <p style={{ color: v('blessed'), fontSize: fontSize.small, margin: `${space.sm}px 0 0` }}>
                โหมด dev: ดักเฉพาะ AI ที่เปิดใน {s.folder} ที่อื่นใช้ได้ปกติ
              </p>
            )}
          </div>
          {next}
        </>
      )}

      {step === 1 && (
        <>
          <Title>ขอดูหน้าหน่อย</Title>
          <p style={{ color: v('textDim'), margin: 0 }}>ใช้กล้องดูว่าไหว้สวยไหม ไม่บันทึก ไม่ส่งรูปออก</p>
          <div style={row}>
            <span>สิทธิ์กล้อง</span>
            <Badge ok={s.camera === 'granted'}>{CAMERA_LABEL[s.camera] ?? s.camera}</Badge>
          </div>
          {s.camera !== 'granted' && (
            <button
              onClick={async () => {
                const r = await setup.camera()
                setMsg(r.ok ? null : 'ไม่ได้สิทธิ์ เปิดได้ที่ System Settings → Privacy & Security → Camera')
                refresh()
              }}
              style={ghostButton}
            >
              ขอสิทธิ์กล้อง
            </button>
          )}
          <Note>{msg}</Note>
          {next}
        </>
      )}

      {step === 2 && (
        <>
          <Title>ให้กูดัก AI ตัวไหน</Title>
          <Check label="Claude Code" checked={s.claude.installed} onChange={(on) => toggleHook('claude', on)} />
          <Check label="Codex" checked={s.codex.installed} onChange={(on) => toggleHook('codex', on)} />
          {s.codex.installed && (
            <div style={{ ...panel, padding: space.md }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Codex ต้องกด trust hook เองก่อน</span>
                <Badge ok={s.codex.trusted}>{s.codex.trusted ? 'trust แล้ว' : 'ยังไม่ trust'}</Badge>
              </div>
              <button
                onClick={async () => {
                  const r = await openCodexHooks()
                  setMsg(r.ok ? 'พิมพ์ /hooks ใน Terminal ที่เด้งขึ้นมา กด trust ทุกตัว แล้วกด "เช็กใหม่"' : `เปิดไม่ได้: ${r.error}`)
                }}
                disabled={!s.codex.cli}
                style={{ ...ghostButton, width: '100%', marginTop: space.sm }}
              >
                {s.codex.cli ? 'เปิด Codex ให้กด trust' : 'ไม่เจอ Codex CLI (ลงแอป ChatGPT/Codex ก่อน)'}
              </button>
              <button onClick={refresh} style={{ ...ghostButton, width: '100%', marginTop: space.sm, borderStyle: 'solid' }}>
                เช็กใหม่
              </button>
            </div>
          )}
          <Note>{msg}</Note>
          {next}
        </>
      )}

      {step === 3 && (
        <>
          <Title>เสร็จละ</Title>
          <Check
            label="เปิดตอนเข้าเครื่อง"
            checked={s.loginItem}
            disabled={!s.canLoginItem}
            hint={s.canLoginItem ? undefined : 'ต้องติดตั้ง shortcut ก่อน (install-shortcut.sh)'}
            onChange={async (on) => {
              const r = await setup.loginItem(on)
              setMsg(r.ok ? null : r.error ?? 'ไม่สำเร็จ')
              refresh()
            }}
          />
          <p style={{ color: v('textDim'), margin: 0 }}>
            เปิด AI ใน <b>{s.folder}</b> แล้วส่ง prompt อะไรก็ได้ popup จะเด้งที่ขอบขวา แก้การตั้งค่าได้ทีหลังในหน้าหลัก
          </p>
          <Note>{msg}</Note>
          <button onClick={finish} style={{ ...panel, borderColor: v('blessed'), color: v('blessed'), cursor: 'pointer', textAlign: 'center' }}>
            🙏 เริ่มใช้งาน
          </button>
        </>
      )}
    </Shell>
  )
}

const CAMERA_LABEL: Record<string, string> = {
  granted: 'อนุญาตแล้ว',
  denied: 'ถูกปฏิเสธ',
  restricted: 'ถูกจำกัด',
  'not-determined': 'ยังไม่ได้ขอ',
}

function Shell({ step, onBack, children }: { step: number; onBack?: () => void; children: ReactNode }) {
  return (
    <div className="is-active" style={page}>
      <div style={dragBar} />
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 className="display" style={{ margin: 0, fontSize: 32, color: v('hud') }}>
          ไหว้กูซะ
        </h1>
        <span className="mono" style={{ color: v('textDim'), fontSize: fontSize.small }}>
          {step >= 0 ? `${step + 1}/${STEPS.length} ${STEPS[step]}` : 'SETUP'}
        </span>
      </header>
      {step >= 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STEPS.length}, 1fr)`, gap: space.xs }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ height: 3, background: i <= step ? v('hud') : v('hudDim') }} />
          ))}
        </div>
      )}
      {children}
      {onBack && (
        <button onClick={onBack} style={{ ...ghostButton, border: 'none', color: v('textDim') }}>
          ◀ ย้อนกลับ
        </button>
      )}
    </div>
  )
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h2 className="display" style={{ margin: 0, fontSize: fontSize.speech, color: v('text') }}>
      {children}
    </h2>
  )
}

function Check(props: { label: string; checked: boolean; disabled?: boolean; hint?: string; onChange: (on: boolean) => void }) {
  return (
    <label style={{ ...panel, padding: space.md, display: 'flex', alignItems: 'center', gap: space.md, cursor: props.disabled ? 'default' : 'pointer', opacity: props.disabled ? 0.5 : 1 }}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
        style={{ width: 20, height: 20, accentColor: v('hud') }}
      />
      <span style={{ flex: 1 }}>
        {props.label}
        {props.hint && <div style={{ color: v('textDim'), fontSize: fontSize.small }}>{props.hint}</div>}
      </span>
      <Badge ok={props.checked}>{props.checked ? 'เปิด' : 'ปิด'}</Badge>
    </label>
  )
}

function Badge({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className="mono" style={{ fontSize: fontSize.small, color: ok ? v('blessed') : v('textDim') }}>
      {ok ? '● ' : '○ '}
      {children}
    </span>
  )
}

function Note({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p style={{ color: v('textDim'), fontSize: fontSize.small, margin: 0, wordBreak: 'break-all' }}>{children}</p>
}
