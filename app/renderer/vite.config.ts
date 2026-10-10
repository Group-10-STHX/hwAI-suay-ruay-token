import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const page = (f: string) => fileURLToPath(new URL(f, import.meta.url))

// multi-page: 1 entry ต่อ 1 window (FRONT_RULES §2)
export default defineConfig({
  plugins: [react()],
  base: './', // Electron โหลดผ่าน file:// ต้องใช้ path แบบ relative
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        avatar: page('./avatar.html'),
        camera: page('./camera-overlay.html'),
        debug: page('./debug.html'),
      },
    },
  },
})
