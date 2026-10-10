import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import { subscribeQueue, subscribeVision, type QueueSnapshot, type VisionEvent } from '../api'

// ที่เดียวที่อ่านข้อมูลจาก api component ข้างล่างรับทาง props เท่านั้น

type Store = {
  queue: QueueSnapshot
  vision: VisionEvent
  daemonOnline: boolean
}

type Action =
  | { type: 'queue'; snapshot: QueueSnapshot }
  | { type: 'vision'; event: VisionEvent }
  | { type: 'daemonOffline' }

const initial: Store = {
  queue: { items: [], state: 'IDLE', failCount: 0, bypass: false },
  vision: { isWai: false, level: 0, score: 0, holdMs: 0, reasons: [], facePresent: true },
  daemonOnline: true,
}

function reducer(s: Store, a: Action): Store {
  switch (a.type) {
    case 'queue':
      return { ...s, queue: a.snapshot, daemonOnline: true }
    case 'vision':
      return { ...s, vision: a.event }
    case 'daemonOffline':
      return s.daemonOnline ? { ...s, daemonOnline: false } : s
  }
}

const Ctx = createContext<Store>(initial)

export function StoreProvider({ children, vision = true }: { children: ReactNode; vision?: boolean }) {
  const [store, dispatch] = useReducer(reducer, initial)

  useEffect(
    () =>
      subscribeQueue(
        (snapshot) => dispatch({ type: 'queue', snapshot }),
        () => dispatch({ type: 'daemonOffline' }),
      ),
    [],
  )

  useEffect(() => {
    if (!vision) return
    return subscribeVision((event) => dispatch({ type: 'vision', event }))
  }, [vision])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)
