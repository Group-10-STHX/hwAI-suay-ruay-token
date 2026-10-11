import { mount } from './mount'
import { StoreProvider } from './store'
import { TributeWindow } from './TributeWindow'

// หน้าต่างนี้ไม่ใช้กล้อง: ปิด vision ใน store
mount(
  <StoreProvider vision={false}>
    <TributeWindow />
  </StoreProvider>,
)
