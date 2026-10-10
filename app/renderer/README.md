# app/renderer · Overlay UI (ทีม Front)

กฎทั้งหมดอยู่ใน [FRONT_RULES.md](FRONT_RULES.md) อ่านก่อนเริ่ม

```bash
npm install
npm run dev:mock     # ใช้ mock ไม่ต้องมีกล้อง/hook/daemon
npm run build        # type-check + build
npm run check:hex    # หา hex ที่หลุดนอก src/theme (DoD)
```

เปิดคู่กัน:
- http://localhost:5173/debug.html สลับ scenario + จำนวนการ์ด
- http://localhost:5173/avatar.html
- http://localhost:5173/camera-overlay.html

กดใน debug แล้วอีกสองหน้าเปลี่ยนตาม (ซิงก์ผ่าน BroadcastChannel)

## ของที่เป็น stub
`mascot/`, `states/`, `queue/`, `meter/`, `camera-overlay/` ตอนนี้เป็นตัวชั่วคราวให้ compile ได้
เจ้าของเปลี่ยนข้างในได้เลย แต่ **props ใน type ห้ามเปลี่ยนโดยไม่บอก Lead** เพราะ `app/` ส่งตามนั้น

## ยังรอทีมอื่น
- #1: ใส่ `state`, `fail_count`, `bypass` ใน `GET /wai/queue` · preload expose `window.wai.onVisionEvent` · `setIgnoreMouseEvents` สำหรับคลิกทะลุ
- Vision: `reasons`, `facePresent`, `snapshotId`, `style` · เวลาค้างท่าที่ต้องได้ (ตอนนี้เดา 1500ms)
- ตอนนี้ adapter ใน `src/api/` เติม default ให้ฟิลด์ที่ยังไม่มา component ไม่ต้องสนใจ
