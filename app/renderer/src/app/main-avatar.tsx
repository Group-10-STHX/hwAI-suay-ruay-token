import { AvatarWindow } from './AvatarWindow'
import { mount } from './mount'
import { StoreProvider } from './store'

mount(
  <StoreProvider>
    <AvatarWindow />
  </StoreProvider>,
)
