import test from 'node:test'
import assert from 'node:assert/strict'
import { FLEE, homePosition, intersects, nextPosition, rectDistance, stepToward } from '../flee.mjs'

const SIZE = { width: 380, height: 600 } // Avatar window (main.mjs AVATAR)
const MAC = { x: 0, y: 25, width: 1440, height: 875 } // MacBook Air workArea (menu bar 25)
const LEFT = { x: -1920, y: -300, width: 1920, height: 1050 } // second display left of and above the primary
const SMALL = { x: 0, y: 0, width: 1024, height: 560 } // smaller than the window: cannot fit

const rect = (p, size = SIZE) => ({ x: p.x, y: p.y, width: size.width, height: size.height })
const pad = (r, n = FLEE.AVOID_PAD) => ({ x: r.x - n, y: r.y - n, width: r.width + 2 * n, height: r.height + 2 * n })
const tick = (cursor, pos, { workArea = MAC, avoid = [], now = 0, mem = {}, size = SIZE } = {}) =>
  nextPosition({ cursor, bounds: { ...pos, ...size }, workArea, avoid, now, mem })

// deterministic PRNG so the "random" sweeps are the same on every run
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function assertInside(r, wa, size = SIZE, margin = FLEE.MARGIN, msg = '') {
  assert.ok(Number.isInteger(r.x) && Number.isInteger(r.y), `integer position ${msg}`)
  assert.ok(r.x >= wa.x + margin && r.x + size.width <= wa.x + wa.width - margin, `x ${r.x} inside ${JSON.stringify(wa)} ${msg}`)
  assert.ok(r.y >= wa.y + margin && r.y + size.height <= wa.y + wa.height - margin, `y ${r.y} inside ${JSON.stringify(wa)} ${msg}`)
}

test('homePosition is the right edge, vertically centred (same as createWindow)', () => {
  assert.deepEqual(homePosition(MAC, SIZE), { x: 1440 - 380 - 16, y: 25 + Math.round((875 - 600) / 2) })
  assert.deepEqual(homePosition(LEFT, SIZE), { x: -1920 + 1920 - 380 - 16, y: -300 + Math.round((1050 - 600) / 2) })
})

test('cursor far away: no move, not active, not fleeing', () => {
  const home = homePosition(MAC, SIZE)
  const r = tick({ x: 100, y: 100 }, home)
  assert.deepEqual([r.x, r.y, r.active, r.fleeing, r.jumped], [home.x, home.y, false, false, false])
  // just outside TRIGGER (cursor 121 px left of the window edge) still does nothing
  const r2 = tick({ x: home.x - FLEE.TRIGGER - 1, y: home.y + 300 }, home)
  assert.deepEqual([r2.x, r2.y, r2.active], [home.x, home.y, false])
})

test('cursor inside the window: moves away from it', () => {
  const pos = { x: 500, y: 140 }
  const cursor = { x: 500 + 300, y: 440 } // inside, right of centre
  const r = tick(cursor, pos)
  assert.equal(r.active, true)
  assert.equal(r.fleeing, true)
  assert.ok(r.x < pos.x, 'moves left, away from a cursor right of centre')
  assert.equal(r.jumped, false)
})

test('glides (no teleport) and stops once the cursor is RELEASE px away', () => {
  let pos = { x: 500, y: 140 }
  let mem = {}
  const cursor = { x: 500 + 380 + 60, y: 440 } // 60 px right of the window
  let moves = 0
  for (let t = 0; t < 60; t++) {
    const r = tick(cursor, pos, { mem, now: t * FLEE.TICK_MS })
    const step = Math.hypot(r.x - pos.x, r.y - pos.y)
    assert.ok(step <= FLEE.STEP_MAX + 1, `step ${step} px is a glide, not a jump`)
    assert.ok(r.x <= pos.x, 'never moves toward the cursor')
    if (step > 0) moves++
    pos = { x: r.x, y: r.y }
    mem = r.mem
  }
  assert.ok(moves >= 2, 'took several ticks')
  assert.ok(rectDistance(cursor, rect(pos)) >= FLEE.RELEASE, 'ended at least RELEASE px from the cursor')
  const still = tick(cursor, pos, { mem, now: 61 * FLEE.TICK_MS })
  assert.deepEqual([still.x, still.y, still.active], [pos.x, pos.y, false], 'then rests')
})

test('hysteresis: a cursor between TRIGGER and RELEASE does not start a flight but does not end one either', () => {
  const pos = { x: 500, y: 140 }
  const cursor = { x: 500 + 380 + 150, y: 440 } // 150 px: TRIGGER < 150 < RELEASE
  assert.equal(tick(cursor, pos).active, false)
  assert.equal(tick(cursor, pos, { mem: { active: true } }).active, true)
})

test('cornered against the right edge: jumps to the far side, then cools down', () => {
  const home = homePosition(MAC, SIZE)
  const cursor = { x: home.x - 80, y: home.y + 300 } // walking in from the left
  const r = tick(cursor, home, { now: 1000 })
  assert.equal(r.jumped, true)
  assert.equal(r.x, MAC.x + FLEE.MARGIN, 'lands on the left edge')
  assertInside(r, MAC)
  assert.ok(rectDistance(cursor, rect(r)) > 500, 'far from the cursor')

  // chase it into the left corner right away: no second jump during the cooldown, and no sliding back under the cursor
  const chase = { x: r.x + 380 + 60, y: r.y + 300 }
  const c1 = tick(chase, r, { mem: r.mem, now: 1000 + FLEE.JUMP_COOLDOWN_MS - 1 })
  assert.equal(c1.jumped, false)
  assert.ok(c1.x <= r.x, 'does not slide toward the cursor')
  const c2 = tick(chase, c1, { mem: c1.mem, now: 1000 + FLEE.JUMP_COOLDOWN_MS })
  assert.equal(c2.jumped, true, 'jumps again after the cooldown')
  assert.ok(c2.x > 900, 'back on the right side')
})

test('cursor inside a window pinned to the edge: jumps instead of dragging the window under the cursor', () => {
  const home = homePosition(MAC, SIZE)
  const r = tick({ x: home.x + 20, y: home.y + 300 }, home)
  assert.equal(r.jumped, true)
  assert.ok(rectDistance({ x: home.x + 20, y: home.y + 300 }, rect(r)) >= FLEE.RELEASE)
})

test('approach from above near the edge: slides down along the wall instead of jumping', () => {
  const home = homePosition(MAC, SIZE)
  const cursor = { x: home.x + 190, y: home.y - 60 } // above the window, 60 px
  const r = tick(cursor, home)
  assert.equal(r.jumped, false)
  assert.equal(r.x, home.x)
  assert.ok(r.y > home.y)
})

test('never leaves the work area: random cursors and random walks, corners, negative-origin display', () => {
  const rand = rng(42)
  for (const wa of [MAC, LEFT, { x: 1440, y: 0, width: 2560, height: 1415 }]) {
    const corners = [
      { x: wa.x, y: wa.y },
      { x: wa.x + wa.width - 1, y: wa.y },
      { x: wa.x, y: wa.y + wa.height - 1 },
      { x: wa.x + wa.width - 1, y: wa.y + wa.height - 1 },
    ]
    let pos = homePosition(wa, SIZE)
    let mem = {}
    let cursor = { x: wa.x + wa.width / 2, y: wa.y + wa.height / 2 }
    for (let t = 0; t < 3000; t++) {
      if (t % 250 === 0) cursor = corners[(t / 250) % 4] // sit in each corner for a while
      else if (t % 7 === 0) cursor = { x: wa.x - 200 + rand() * (wa.width + 400), y: wa.y - 200 + rand() * (wa.height + 400) } // incl. off-display
      else {
        // chase the window centre, the way a person tries to catch it
        const cx = pos.x + SIZE.width / 2
        const cy = pos.y + SIZE.height / 2
        cursor = { x: cursor.x + (cx - cursor.x) * 0.15, y: cursor.y + (cy - cursor.y) * 0.15 }
      }
      const r = tick(cursor, pos, { workArea: wa, mem, now: t * FLEE.TICK_MS })
      assertInside(r, wa, SIZE, FLEE.MARGIN, `tick ${t}`)
      assert.equal(Object.hasOwn(r, 'width') || Object.hasOwn(r, 'height'), false, 'never changes size')
      pos = { x: r.x, y: r.y }
      mem = r.mem
    }
  }
})

test('a window outside the work area (display changed) is pulled back inside, even with the cursor far away', () => {
  const r = tick({ x: 100, y: 100 }, { x: 1300, y: 700 })
  assertInside(r, MAC)
  const r2 = tick({ x: 100, y: 100 }, { x: -5000, y: -5000 }, { workArea: LEFT })
  assertInside(r2, LEFT)
})

test('avoid rects (webcam window) are never covered, including mid-glide', () => {
  const rand = rng(7)
  const webcam = { x: 520, y: 260, width: 400, height: 300 } // centre of the MacBook screen
  const hard = pad(webcam)
  let pos = homePosition(MAC, SIZE)
  let mem = {}
  for (let t = 0; t < 3000; t++) {
    const cursor = t % 3 ? { x: pos.x + SIZE.width / 2 + (rand() - 0.5) * 300, y: pos.y + 300 + (rand() - 0.5) * 300 } : { x: rand() * 1440, y: 25 + rand() * 875 }
    const r = tick(cursor, pos, { avoid: [webcam], mem, now: t * FLEE.TICK_MS })
    assertInside(r, MAC, SIZE, FLEE.MARGIN, `tick ${t}`)
    assert.equal(intersects(rect(r), hard), false, `tick ${t}: covers the webcam at ${r.x},${r.y}`)
    pos = { x: r.x, y: r.y }
    mem = r.mem
  }
})

test('a webcam window that appears on top of the avatar pushes it off, cursor or not', () => {
  const home = homePosition(MAC, SIZE)
  const webcam = { x: home.x - 100, y: home.y + 100, width: 300, height: 200 }
  const r = tick({ x: 50, y: 50 }, home, { avoid: [webcam] })
  assert.equal(intersects(rect(r), pad(webcam)), false)
  assertInside(r, MAC)
})

test('soft avoid (home window) is respected when there is room, dropped when there is not', () => {
  const homeWin = { x: 510, y: 162, width: 420, height: 600, soft: true } // centred home window
  const home = homePosition(MAC, SIZE)
  const r = tick({ x: home.x - 80, y: home.y + 300 }, home, { avoid: [homeWin] })
  assert.equal(r.jumped, true)
  assert.equal(intersects(rect(r), pad(homeWin)), false, 'jumped to a spot clear of the home window')

  const everywhere = { ...MAC, soft: true }
  const webcam = { x: 520, y: 260, width: 400, height: 300 }
  const r2 = tick({ x: home.x - 80, y: home.y + 300 }, home, { avoid: [everywhere, webcam] })
  assertInside(r2, MAC)
  assert.equal(intersects(rect(r2), pad(webcam)), false, 'the hard rect still wins over the soft one')
})

test('impossible avoid rect: the work area rule still wins', () => {
  const home = homePosition(MAC, SIZE)
  const r = tick({ x: home.x + 20, y: home.y + 20 }, home, { avoid: [{ x: -100, y: -100, width: 3000, height: 3000 }] })
  assertInside(r, MAC)
})

test('window larger than the work area: pinned to the top edge, no NaN, stays put', () => {
  const r = tick({ x: 500, y: 300 }, { x: 600, y: 0 }, { workArea: SMALL })
  assert.ok(Number.isInteger(r.x) && Number.isInteger(r.y))
  assert.equal(r.y, SMALL.y)
  assert.ok(r.x >= SMALL.x + FLEE.MARGIN && r.x + SIZE.width <= SMALL.x + SMALL.width - FLEE.MARGIN)
})

test('cursor exactly at the window centre: no NaN, still escapes', () => {
  const pos = { x: 500, y: 140 }
  const r = tick({ x: 690, y: 440 }, pos)
  assert.ok(Number.isInteger(r.x) && Number.isInteger(r.y))
  assert.equal(r.active, true)
  assert.ok(r.x !== pos.x || r.y !== pos.y)
})

test('fleeing stays true for FLEEING_MS after the last move, then turns off', () => {
  const pos = { x: 500, y: 140 }
  const r = tick({ x: 800, y: 440 }, pos, { now: 5000 })
  assert.equal(r.fleeing, true)
  const far = { x: 1400, y: 880 }
  const later = tick(far, r, { mem: { ...r.mem, active: false }, now: 5000 + FLEE.FLEEING_MS - 1 })
  assert.equal(later.fleeing, true)
  const done = tick(far, later, { mem: later.mem, now: 5000 + FLEE.FLEEING_MS })
  assert.equal(done.fleeing, false)
})

test('deterministic: same input, same output', () => {
  const input = { cursor: { x: 1000, y: 400 }, bounds: { x: 1044, y: 163, ...SIZE }, workArea: MAC, avoid: [{ x: 520, y: 260, width: 400, height: 300 }], now: 77, mem: {} }
  assert.deepEqual(nextPosition(input), nextPosition(structuredClone(input)))
})

test('stepToward: eased, integer, never overshoots, arrives', () => {
  let p = { x: 16, y: 163 }
  const home = { x: 1044, y: 163 }
  let n = 0
  while ((p.x !== home.x || p.y !== home.y) && n < 500) {
    const q = stepToward(p, home)
    assert.ok(Number.isInteger(q.x) && Number.isInteger(q.y))
    assert.ok(q.x > p.x && q.x <= home.x, 'moves toward the target without overshooting')
    assert.ok(q.x - p.x <= FLEE.STEP_MAX + 1)
    p = q
    n++
  }
  assert.deepEqual(p, home)
  assert.ok(n > 10 && n < 100, `${n} ticks to glide home`)
})
