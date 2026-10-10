import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyTokens } from '../theme/tokens'
import '../theme/global.css'
import '../theme/effects.css'

export function mount(node: ReactNode) {
  applyTokens()
  createRoot(document.getElementById('root')!).render(<StrictMode>{node}</StrictMode>)
}
