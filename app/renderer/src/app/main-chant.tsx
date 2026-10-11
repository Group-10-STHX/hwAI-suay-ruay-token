import { ChantWindow } from './ChantWindow'
import { mount } from './mount'

// หน้าต่างนี้ไม่ใช้กล้องและไม่ใช้ store: poll /wai/chant เองใน ChantWindow
mount(<ChantWindow />)
