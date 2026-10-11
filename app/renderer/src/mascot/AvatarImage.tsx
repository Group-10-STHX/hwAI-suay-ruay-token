import { radius, v, type ColorToken } from '../theme/tokens'

// รูปน้อง (thumbnail ใน selector ฯลฯ) · src ที่ขึ้นต้น `mock:` = น้องปลอมโหมด mock วาดด้วย CSS

const STUB_TONES: ColorToken[] = ['blessed', 'hud', 'sulk']

export type AvatarImageProps = {
  src: string
  size: number
  alt?: string
}

export function AvatarImage({ src, size, alt = '' }: AvatarImageProps) {
  if (src.startsWith('mock:')) return <AvatarStub name={src.slice(5)} size={size} />
  return <img src={src} alt={alt} width={size} height={size} draggable={false} style={{ display: 'block', objectFit: 'contain' }} />
}

export function AvatarStub({ name, size }: { name: string; size: number }) {
  const tone = STUB_TONES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % STUB_TONES.length]
  const eye = { width: size * 0.12, height: size * 0.12, borderRadius: '50%', background: v('bg') }
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: radius.lg,
        background: v(tone),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: size * 0.18,
      }}
    >
      <span style={eye} />
      <span style={eye} />
    </div>
  )
}
