import type { ReactNode } from 'react'
import type { QueueItem } from '../api/types'
import { font, fontSize, providerAccent, radius, shadow, space, v, type ColorToken } from '../theme/tokens'
import { TimeLeft } from './TimeLeft'

export type AgentCardProps = {
  item: QueueItem
  now: number // epoch ms
  timeoutMs: number // REQUEST_TIMEOUT_MS จาก app/
  tone: ColorToken // สีขอบ
  dim?: boolean // ใบที่ยังไม่ถึงคิว จางลงนิด
  avatar?: ReactNode // น้องตัวเล็ก app/ ส่ง <Mascot size="small"/> มา
}

const KIND: Record<QueueItem['kind'], string> = { prompt: 'prompt', subagent: 'sub-agent' }

/** การ์ดเอเจนต์ 1 ตัวที่รอคิว: ฟองเล็กซ้าย น้องตัวเล็กขวา (ตาม prototype/agent-popup-mac) */
export function AgentCard({ item, now, timeoutMs, tone, dim, avatar }: AgentCardProps) {
  const accent = providerAccent[item.source]
  const fill = v('surface')
  const edge = `1px solid ${v(tone)}`
  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: space.sm,
        opacity: dim ? 0.78 : 1,
      }}
    >
      <div
        style={{
          position: 'relative',
          minWidth: 0,
          maxWidth: 236,
          padding: `${space.xs + 2}px ${space.sm + 2}px`,
          borderRadius: radius.md,
          background: fill,
          border: edge,
          boxShadow: shadow.float,
        }}
      >
        <div
          style={{
            fontFamily: font.body,
            fontWeight: 600,
            fontSize: fontSize.body - 1,
            color: v('text'),
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.agentLabel}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm - 2, fontSize: fontSize.small - 1, marginTop: 2 }}>
          <span className="display" style={{ color: accent.color }}>
            {accent.label}
          </span>
          <span style={{ color: v('textDim') }}>{KIND[item.kind]}</span>
          <TimeLeft createdAt={item.createdAt} now={now} timeoutMs={timeoutMs} />
        </div>
        <span
          aria-hidden
          style={{
            position: 'absolute',
            right: -6,
            top: '50%',
            width: 10,
            height: 10,
            transform: 'translateY(-50%) rotate(-45deg)',
            background: fill,
            borderRight: edge,
            borderBottom: edge,
          }}
        />
      </div>
      {avatar}
    </li>
  )
}
