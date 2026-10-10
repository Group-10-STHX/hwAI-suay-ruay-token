import { CameraOverlayWindow } from './CameraOverlayWindow'
import { mount } from './mount'
import { StoreProvider } from './store'

mount(
  <StoreProvider>
    <CameraOverlayWindow />
  </StoreProvider>,
)
