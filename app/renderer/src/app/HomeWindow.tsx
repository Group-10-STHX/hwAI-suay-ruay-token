import { useEffect, useRef, useState } from 'react'
import { avatarUrl, listStickers, sendTestRequest, setEnabled, setMonitor, setStickerStyle, setup, stickerUrl, subscribeStatus, USE_MOCK, type AppStatus, type StickerItem, type StickerStyle } from '../api'
import { v } from '../theme/tokens'
import { useSfxLevel } from '../sfx/store'
import { Onboarding } from './Onboarding'
import { useAvatars } from './useAvatars'
import { CAMERA_ANCHOR, CameraSection } from './CameraTab'
import { DayChart } from '../meter'
import { HomeTabs, type HomeTab } from './HomeTabs'
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
  // แท็บเป็นทางลัดเลื่อนหน้า (หน้าเดียวยาว): "กล้อง" เลื่อนไปส่วนกล้อง · "หน้าหลัก" กลับบนสุด · ไฮไลต์ตามตำแหน่งที่เลื่อนอยู่
  const holder = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<HomeTab>('home')
  useEffect(() => {
    const scroller = () => holder.current?.firstElementChild as HTMLElement | null
    const sync = () => {
      const s = scroller()
      const cam = s?.querySelector<HTMLElement>(`#${CAMERA_ANCHOR}`)
      if (!s || !cam) return
      // ส่วนกล้องขึ้นมาอยู่ครึ่งบนของจอ = แท็บกล้อง
      setTab(cam.getBoundingClientRect().top < s.getBoundingClientRect().top + s.clientHeight * 0.5 && s.scrollTop > 8 ? 'camera' : 'home')
    }
    const s = scroller()
    s?.addEventListener('scroll', sync, { passive: true })
    return () => s?.removeEventListener('scroll', sync)
  })
  const goTab = (t: HomeTab) => {
    const s = holder.current?.firstElementChild as HTMLElement | null
    if (!s) return
    if (t === 'home') return s.scrollTo({ top: 0, behavior: 'smooth' })
    s.querySelector<HTMLElement>(`#${CAMERA_ANCHOR}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
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
    cameraSlot: <CameraSection />,
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

  // แท็บ 1 = กล้อง (เปิดแอปมาเจอหน้านี้) · แท็บ 2 = หน้าหลักเดิม
  // data-wai-chrome / data-wai-scroll: main วัดความสูงให้หน้าต่างพอดีเนื้อหาของแท็บที่เปิดอยู่
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: v('bg') }}>
      <HomeTabs tab={tab} onTab={goTab} />
      <div ref={holder} data-wai-scroll style={{ flex: 1, minHeight: 0 }}>
        {body}
      </div>
    </div>
  )
}
