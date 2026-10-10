// flee: "หนีเมาส์" ของ Avatar window ช่วง ANNOYED (FRONT_RULES §4)
//
// Pure module: no Electron, no timers, no Math.random. main.mjs owns the ~30 fps timer and calls
//   nextPosition({ cursor, bounds, workArea, avoid, now, mem }) → { x, y, fleeing, jumped, active, mem }
//   stepToward(from, to)               one glide step (also used to glide back home)
//   homePosition(workArea, size)       the popup's resting spot: right edge, vertically centred
// Thread `mem` from one call into the next (start with {}); same inputs → same output, so tests are stable.
//
// Rules (hard → soft)
//   1. the window stays inside workArea (MARGIN from the edges when it fits) and its size never changes
//   2. never cover a hard avoid rect (webcam window), padded by AVOID_PAD
//   3. try not to cover soft avoid rects ({ ...rect, soft: true }, e.g. the home window); dropped when nothing else fits
//   If 2/3 cannot be met at all, rule 1 still wins (the window is clamped and left where it is).
//
// Behaviour
//   - starts fleeing when the cursor is inside the window or within TRIGGER px of its edge,
//     keeps fleeing until the cursor is RELEASE px away (hysteresis, no jitter at the border)
//   - target = the legal spot SAFE px away from the cursor that needs the least travel (16 directions around
//     the cursor, the "away" direction first), never one that means sliding back across the cursor;
//     glides there with an eased step (STEP_MIN..STEP_MAX px per tick)
//   - cornered (no such spot ≥ RELEASE px from the cursor, e.g. pinned against the right edge): jumps to the
//     far side of the work area at once, then waits JUMP_COOLDOWN_MS before it may jump again (no ping-pong)
//   - fleeing = the window moved within the last FLEEING_MS

export const FLEE = Object.freeze({
  TRIGGER: 120, // px from the window edge (0 = inside) that starts the flight
  RELEASE: 170, // px from the window edge that ends it
  SAFE: 220, // px between cursor and window edge that a flight aims for
  MARGIN: 16, // px kept from the work area edges (same 16 px as the home spot)
  AVOID_PAD: 12, // px kept around avoid rects
  STEP_MIN: 6, // px per tick
  STEP_MAX: 28, // px per tick (~840 px/s at 30 fps: escapes a walking cursor, a quick flick still catches it)
  EASE: 0.3, // share of the remaining distance covered per tick
  JUMP_COOLDOWN_MS: 600,
  FLEEING_MS: 300,
  TICK_MS: 33, // main's timer (~30 fps)
  DIRECTIONS: 16,
})

const finite = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)

/** distance from point to rect (0 when inside) */
export function rectDistance(p, r) {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width))
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height))
  return Math.hypot(dx, dy)
}

/** strict overlap (touching edges do not count) */
export function intersects(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

const at = (p, size) => ({ x: p.x, y: p.y, width: size.width, height: size.height })
const pad = (r, n) => ({ x: r.x - n, y: r.y - n, width: r.width + 2 * n, height: r.height + 2 * n })
const same = (a, b) => a.x === b.x && a.y === b.y

/** integer range [lo, hi] for the window's x (or y); MARGIN shrinks to 0, then pins to the start when it does not fit */
function axisRange(start, length, size, margin) {
  const lo = Math.ceil(start + margin)
  const hi = Math.floor(start + length - size - margin)
  if (hi >= lo) return [lo, hi]
  if (margin > 0) return axisRange(start, length, size, 0)
  const s = Math.ceil(start)
  return [s, s] // bigger than the work area: keep the top/left edge on screen
}

function bounds(workArea, size, o) {
  return { x: axisRange(workArea.x, workArea.width, size.width, o.MARGIN), y: axisRange(workArea.y, workArea.height, size.height, o.MARGIN) }
}

const clampAxis = (v, [lo, hi]) => Math.min(hi, Math.max(lo, Math.round(finite(v, lo))))
const clampTo = (p, b) => ({ x: clampAxis(p.x, b.x), y: clampAxis(p.y, b.y) })

/** the popup's resting spot: right edge, vertically centred (same as createWindow) */
export function homePosition(workArea, size, opts = {}) {
  const o = { ...FLEE, ...opts }
  const b = bounds(workArea, size, o)
  return clampTo({ x: workArea.x + workArea.width - size.width - o.MARGIN, y: workArea.y + Math.round((workArea.height - size.height) / 2) }, b)
}

/** one eased glide step from → to (integers, never overshoots) */
export function stepToward(from, to, opts = {}) {
  const o = { ...FLEE, ...opts }
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  if (dist <= o.STEP_MIN) return { x: to.x, y: to.y }
  const step = Math.min(o.STEP_MAX, Math.max(o.STEP_MIN, dist * o.EASE))
  return { x: Math.round(from.x + (dx / dist) * step), y: Math.round(from.y + (dy / dist) * step) }
}

const legal = (p, size, rects) => !rects.some((r) => intersects(at(p, size), r))

/** grid of positions over the allowed range (corners and edge midpoints first) */
function anchors(b, n = 5) {
  const pick = ([lo, hi]) => {
    const out = [lo, hi, Math.round((lo + hi) / 2)]
    for (let i = 1; i < n - 1; i++) out.push(Math.round(lo + ((hi - lo) * i) / (n - 1)))
    return [...new Set(out)]
  }
  const out = []
  for (const y of pick(b.y)) for (const x of pick(b.x)) out.push({ x, y })
  return out
}

/** nearest legal position to p (clamped; pushed out of avoid rects; hard rects beat soft ones; workArea beats both) */
function settle(p, size, b, avoid, o) {
  const q = clampTo(p, b)
  const hard = avoid.filter((r) => !r.soft).map((r) => pad(r, o.AVOID_PAD))
  const all = avoid.map((r) => pad(r, o.AVOID_PAD))
  for (const rects of all.length > hard.length ? [all, hard] : [all]) {
    if (legal(q, size, rects)) return q
    const near = (c) => Math.hypot(c.x - q.x, c.y - q.y)
    // push out of each overlapping rect along the 4 sides, then fall back to the anchor grid
    const pushed = rects
      .filter((r) => intersects(at(q, size), r))
      .flatMap((r) => [
        { x: r.x - size.width, y: q.y },
        { x: r.x + r.width, y: q.y },
        { x: q.x, y: r.y - size.height },
        { x: q.x, y: r.y + r.height },
      ])
      .map((c) => clampTo(c, b))
    let best = null
    for (const c of [...pushed, ...anchors(b)]) if (legal(c, size, rects) && (!best || near(c) < near(best))) best = c
    if (best) return best
  }
  return q
}

/** unit vector from the cursor to the window centre (cursor dead centre: toward the roomier side) */
function awayFrom(cursor, cur, size, b) {
  const cx = cur.x + size.width / 2
  let ax = cx - cursor.x
  let ay = cur.y + size.height / 2 - cursor.y
  if (Math.hypot(ax, ay) < 1e-6) {
    ax = (b.x[0] + b.x[1] + size.width) / 2 - cx || -1
    ay = 0
  }
  const n = Math.hypot(ax, ay)
  return { x: ax / n, y: ay / n }
}

/** candidate targets around the cursor, the direction away from the cursor first */
function candidates(cursor, size, b, avoid, o, dir) {
  const away = Math.atan2(dir.y, dir.x)
  const hw = size.width / 2
  const hh = size.height / 2
  const out = []
  for (let k = 0; k < o.DIRECTIONS; k++) {
    const turn = (k % 2 ? 1 : -1) * Math.ceil(k / 2) // 0, +1, -1, +2, -2 ...
    const a = away + (turn * 2 * Math.PI) / o.DIRECTIONS
    const ux = Math.cos(a)
    const uy = Math.sin(a)
    const reach = hw * Math.abs(ux) + hh * Math.abs(uy) + o.SAFE // centre this far → edge about SAFE away
    out.push(settle({ x: cursor.x + ux * reach - hw, y: cursor.y + uy * reach - hh }, size, b, avoid, o))
  }
  return out
}

/** far side of the work area: the legal anchor farthest from the cursor (mirror of the current spot first) */
function farSide(cursor, cur, size, b, avoid, o) {
  const mirror = { x: b.x[0] + b.x[1] - cur.x, y: cur.y }
  let best = null
  let bestD = -1
  for (const c of [mirror, ...anchors(b)].map((p) => settle(p, size, b, avoid, o))) {
    const d = rectDistance(cursor, at(c, size))
    if (d > bestD) [best, bestD] = [c, d]
  }
  return { pos: best, dist: bestD }
}

/**
 * one tick of "หนีเมาส์"
 * @param {{ cursor:{x:number,y:number}, bounds:{x:number,y:number,width:number,height:number},
 *           workArea:{x:number,y:number,width:number,height:number}, avoid?:Array<object>, now?:number, mem?:object, opts?:object }} input
 * @returns {{ x:number, y:number, fleeing:boolean, jumped:boolean, active:boolean, mem:object }}
 */
export function nextPosition({ cursor, bounds: win, workArea, avoid = [], now = 0, mem = {}, opts = {} }) {
  const o = { ...FLEE, ...opts }
  const size = { width: win.width, height: win.height }
  const b = bounds(workArea, size, o)
  const m = { active: false, lastMoveAt: -Infinity, jumpReadyAt: -Infinity, ...mem }
  const start = { x: win.x, y: win.y }
  const rects = avoid.filter((r) => r && r.width > 0 && r.height > 0)

  // an illegal spot (display changed, webcam window appeared on top) is fixed first, whatever the cursor does
  let next = settle(start, size, b, rects, o)
  let jumped = false
  const d = rectDistance(cursor, at(next, size))
  const active = m.active ? d < o.RELEASE : d <= o.TRIGGER

  if (active) {
    const dir = awayFrom(cursor, next, size, b)
    const scored = candidates(cursor, size, b, rects, o, dir).map((c) => {
      const dx = c.x - next.x
      const dy = c.y - next.y
      const travel = Math.hypot(dx, dy)
      // > -0.25: away from the cursor or sideways along a wall, never back across it (that would drag the window
      // under the cursor, where it can be clicked; a jump is better then)
      const forward = travel > 0 && (dx * dir.x + dy * dir.y) / travel > -0.25
      return { c, travel, forward, dist: rectDistance(cursor, at(c, size)) }
    })
    const good = scored.filter((s) => s.forward && s.dist >= o.RELEASE)
    let target = null
    if (good.length) target = good.reduce((a, s) => (s.travel < a.travel ? s : a)).c
    else {
      // cornered: jump to the far side (not more often than JUMP_COOLDOWN_MS), else do the best we can
      const far = now >= m.jumpReadyAt ? farSide(cursor, next, size, b, rects, o) : null
      if (far && far.dist > d && !same(far.pos, next)) {
        next = far.pos
        jumped = true
        m.jumpReadyAt = now + o.JUMP_COOLDOWN_MS
      } else {
        const best = scored.filter((s) => s.forward && s.dist > d).reduce((a, s) => (!a || s.dist > a.dist ? s : a), null)
        target = best ? best.c : null // nowhere better without crossing the cursor: hold still until the cooldown ends
      }
    }
    if (target && !same(target, next)) {
      const step = stepToward(next, target, o)
      const avoidRects = rects.map((r) => pad(r, o.AVOID_PAD))
      // a step never crosses an avoid rect the target itself stays clear of: skip straight to the target instead
      next = legal(step, size, avoidRects.filter((r) => !intersects(at(target, size), r))) ? clampTo(step, b) : target
    }
  }

  if (!same(next, start)) m.lastMoveAt = now
  m.active = active
  return { x: next.x, y: next.y, fleeing: now - m.lastMoveAt < o.FLEEING_MS, jumped, active, mem: m }
}
