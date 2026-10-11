// เก็บระดับเสียงใน localStorage ("waiSfxLevel") sync ข้าม window ผ่าน storage event
import { useSyncExternalStore } from 'react'
import type { SfxLevel } from './policy'

const KEY = 'waiSfxLevel'
const DEFAULT: SfxLevel = 'few'
const LEVELS: SfxLevel[] = ['off', 'few', 'many']

let current: SfxLevel = read()
const listeners = new Set<() => void>()

function read(): SfxLevel {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw && (LEVELS as string[]).includes(raw)) return raw as SfxLevel
  } catch {
    /* localStorage ใช้ไม่ได้ */
  }
  return DEFAULT
}

function emit() {
  listeners.forEach((l) => l())
}

export function getSfxLevel(): SfxLevel {
  return current
}

export function setSfxLevel(l: SfxLevel) {
  current = l
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* ignore */
  }
  emit()
}

export function subscribeSfxLevel(fn: () => void): () => void {
  listeners.add(fn)
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      const next = read()
      if (next !== current) {
        current = next
        fn()
      }
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(fn)
    window.removeEventListener('storage', onStorage)
  }
}

export function useSfxLevel(): [SfxLevel, (l: SfxLevel) => void] {
  const level = useSyncExternalStore(subscribeSfxLevel, getSfxLevel, () => DEFAULT)
  return [level, setSfxLevel]
}
