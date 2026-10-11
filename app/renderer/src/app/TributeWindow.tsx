import { submitTribute, TRIBUTE_AMOUNT_BAHT } from '../api'
import cardSrc from '../assets/truemoney-1000.png'
import { TributePanel } from '../states'
import { fontSize, space, v } from '../theme/tokens'
import { dragBar } from './homeStyles'
import { useStore } from './store'

// หน้าต่างจ่ายค่าไถ่ True Money (mock ล้อเล่น) · main เปิดตอน event.kind = tribute และปิดเองตอน event หาย
// window ปกติ ไม่โปร่ง (mac hiddenInset + แถบลาก 32px) · logic แค่อ่าน event จาก store แล้วส่งลง TributePanel

export function TributeWindow() {
  const { queue } = useStore()
  const ev = queue.event?.kind === 'tribute' ? queue.event : undefined
  const amount = ev?.amount ?? TRIBUTE_AMOUNT_BAHT
  return (
    <div
      style={{
        minHeight: '100%',
        background: v('bg'),
        padding: `${space.xl}px ${space.lg}px ${space.md}px`,
        boxSizing: 'border-box',
        overflow: 'auto',
      }}
    >
      <div style={dragBar} />
      <TributePanel
        amount={amount}
        text={ev?.text}
        cardSrc={cardSrc}
        onSubmit={submitTribute}
        onDismiss={() => (window.wai?.closeTribute ? window.wai.closeTribute() : window.close())}
      />
      <div style={{ marginTop: space.sm, color: v('textDim'), fontSize: fontSize.micro }}>ปิดหน้าต่างนี้ได้ น้องยังรอคำตอบอยู่</div>
    </div>
  )
}
