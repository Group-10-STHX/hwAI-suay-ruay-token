import { Fragment, type ReactNode } from 'react'

/**
 * ตัดบรรทัดเฉพาะที่ช่องว่าง (Chrome ตัดภาษาไทยกลางวลีได้ เช่น "กูถึงจะ|หยุด")
 * ช่องว่างต้องอยู่นอก span nowrap ถึงจะตัดบรรทัดตรงนั้นได้
 * ใช้กับข้อความที่เช็กแล้วว่าทุกวลีกว้างไม่เกินฟอง ไม่งั้นวลีนั้นจะล้น
 */
export function byPhrase(text: string): ReactNode {
  return text.split(' ').map((w, i) => (
    <Fragment key={i}>
      {i > 0 && ' '}
      <span style={{ whiteSpace: 'nowrap' }}>{w}</span>
    </Fragment>
  ))
}
