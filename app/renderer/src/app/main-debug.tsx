import { DebugPanel } from './DebugPanel'
import { mount } from './mount'
import { StoreProvider } from './store'

mount(
  <StoreProvider>
    <DebugPanel />
  </StoreProvider>,
)
