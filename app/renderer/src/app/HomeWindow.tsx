import { useEffect, useState } from 'react'
import { avatarUrl, listStickers, openCameraView, openWeb, sendTestRequest, setEnabled, setMonitor, setStickerStyle, setup, stickerUrl, subscribeStatus, USE_MOCK, type AppStatus, type StickerItem, type StickerStyle } from '../api'
import { fontSize, space, v } from '../theme/tokens'
import { useSfxLevel } from '../sfx/store'
import { Onboarding } from './Onboarding'
import { useAvatars } from './useAvatars'
import { DayChart } from '../meter'
import { ghostButton } from './homeStyles'
import { HomeA } from './home-variants/HomeA'
import { HomeB } from './home-variants/HomeB'
import { HomeC } from './home-variants/HomeC'
import { HomeDefault } from './home-variants/HomeDefault'
import type { HomeProps } from './home-variants/model'
import { nextVariant, resolveVariant, setVariant, type Variant } from './home-variants/variant'

// หน้าหลัก: เปิดตอนเริ่มแอป ปิดแล้วแอปยังอยู่บน menu bar
// ไฟล์นี้เป็น dispatcher อย่างเดียว: อ่าน api/hook ที่นี่ที่เดียว แล้วส่ง HomeProps ลงร่างที่เลือก (FRONT_RULES "home variants")
// ร่างเลือกจาก ?variant=a|b|c (จำใน localStorage) ไม่มี = ร่างเดิม (HomeDefault)

export function HomeWindow() {
  const [variant, setVariantState] = useState<Variant | null>(() => resolveVariant())
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [offline, setOffline] = useState(false)
  const [onboarding, setOnboarding] = useState(false)
  const [sfx, setSfx] = useSfxLevel()

  const [stickers, setStickers] = useState<StickerItem[]>([])
  const [stickerStyle, setStickerStyleState] = useState<StickerStyle>('photo')
  // สติ๊กเกอร์ล่าสุด: poll ช้าๆ (ใหม่เกิดตอนไหว้ผ่านเท่านั้น) daemon เก่า/ออฟไลน์ = ไม่มีแถบ
  useEffect(() => {
    let alive = true
    const load = () =>
      listStickers()
        .then((l) => {
          if (!alive) return
          setStickers(l.items.slice(0, 6))
          setStickerStyleState(l.style)
        })
        .catch(() => {})
    load()
    const t = setInterval(load, 4000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  const chooseStickerStyle = (s: StickerStyle) => {
    setStickerStyleState(s)
    setStickerStyle(s).catch(() => {})
  }

  // เปิดครั้งแรก (ยังไม่เคย onboard) → โชว์ onboarding · ใน browser ธรรมดาไม่มี bridge ก็ข้ามไป
  useEffect(() => {
    setup
      .status()
      .then((s) => setOnboarding(!s.onboarded))
      .catch(() => {})
  }, [])

  useEffect(
    () =>
      subscribeStatus(
        (s) => {
          setStatus(s)
          setOffline(false)
        },
        () => setOffline(true),
      ),
    [],
  )

  // ตัวละคร: ร่างใหม่รับทาง props (ร่างเดิมใช้ AvatarPicker ที่ดึงเองอยู่แล้ว ไม่ต้องดึงซ้ำ)
  const avatars = useAvatars(status?.avatar, variant !== null)

  const cycleVariant = () => {
    const next = nextVariant(variant)
    setVariant(next)
    setVariantState(next)
  }

  if (onboarding) return <Onboarding onDone={() => setOnboarding(false)} />

  const props: HomeProps = {
    status,
    offline,
    mock: USE_MOCK,
    sfx,
    onSfx: setSfx,
    avatars: avatars.items,
    avatar: avatars.active,
    onAvatar: avatars.choose,
    avatarSrc: avatarUrl,
    stickers,
    stickerStyle,
    onStickerStyle: chooseStickerStyle,
    stickerUrl,
    onToggle: () => {
      if (status) setEnabled(!status.enabled)
    },
    onMonitor: () => {
      if (status) setMonitor(!status.monitor)
    },
    onTest: () => {
      sendTestRequest()
    },
    onSettings: () => setOnboarding(true),
    cameraLink: (
      <div className="fx-render" style={{ display: 'grid', gap: space.xs }}>
        <button onClick={() => openCameraView().catch(() => {})} style={{ ...ghostButton, fontSize: fontSize.small }}>
          📷 เปิดหน้าต่างกล้อง
        </button>
        {status?.web ? (
          <div style={{ display: 'grid', gridTemplateColumns: status.web.me ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: space.xs }}>
            <button onClick={() => openWeb('rank', status.web?.rank)} style={{ ...ghostButton, fontSize: fontSize.small }}>
              🏆 อันดับ
            </button>
            <button onClick={() => openWeb('tv', status.web?.tv)} style={{ ...ghostButton, fontSize: fontSize.small }}>
              📺 จอ TV
            </button>
            {status.web.me && (
              <button onClick={() => openWeb('me', status.web?.me ?? undefined)} style={{ ...ghostButton, fontSize: fontSize.small }}>
                👤 โปรไฟล์ฉัน
              </button>
            )}
          </div>
        ) : (
          <span style={{ color: v('textDim'), fontSize: fontSize.micro }}>🏆 เว็บอันดับยังไม่ได้เชื่อม (ตั้ง web.enabled ใน ~/.waikusa/config.json)</span>
        )}
      </div>
    ),
    graphSlot: status?.stats.days?.length ? <DayChart days={status.stats.days} /> : undefined,
    variant: variant ?? undefined,
    onCycleVariant: variant ? cycleVariant : undefined,
  }

  const body = (() => {
    switch (variant) {
      case 'a':
        return <HomeA {...props} />
      case 'b':
        return <HomeB {...props} />
      case 'c':
        return <HomeC {...props} />
      default:
        return <HomeDefault {...props} />
    }
  })()

  return body
}
