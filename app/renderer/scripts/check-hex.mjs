// หา hex สีที่หลุดนอก src/theme (FRONT_RULES §9) ใช้ node แทน grep จะได้รันบน Windows ได้
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

const HEX = /#[0-9A-Fa-f]{3,8}\b/
const hits = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (p !== join('src', 'theme')) walk(p)
    } else if (/\.(tsx?|css)$/.test(name)) {
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => HEX.test(line) && hits.push(`${p}:${i + 1}: ${line.trim()}`))
    }
  }
}
walk('src')
if (hits.length) {
  console.error(`เจอ hex นอก src${sep}theme ใช้ token แทน:\n` + hits.join('\n'))
  process.exit(1)
}
console.log('ok ไม่มี hex นอก theme')
