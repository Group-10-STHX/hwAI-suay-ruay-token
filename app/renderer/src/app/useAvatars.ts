import { useCallback, useEffect, useState } from 'react'
import { listAvatars, setAvatar, type AvatarItem } from '../api'

// รายการตัวละคร + ตัวที่เลือกอยู่ (logic เดียวกับ AvatarPicker แต่แยกเป็น hook ให้ร่างหน้าหลักรับทาง props)
// current มาจาก /wai/status (poll อยู่แล้ว) ใช้ก่อน ค่าที่เพิ่งกดชนะจนกว่า poll จะตามทัน

export function useAvatars(current: string | undefined, enabled = true) {
  const [items, setItems] = useState<AvatarItem[]>([])
  const [listed, setListed] = useState('jason')
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    listAvatars()
      .then((l) => {
        if (!alive) return
        setItems(l.items)
        setListed(l.current)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [enabled])

  useEffect(() => {
    if (picked && current === picked) setPicked(null)
  }, [current, picked])

  const choose = useCallback((name: string) => {
    setPicked(name)
    setAvatar(name)
      .then((c) => setPicked(c))
      .catch(() => setPicked(null))
  }, [])

  return { items, active: picked ?? current ?? listed, choose }
}
