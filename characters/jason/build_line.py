#!/usr/bin/env python3
"""Jason, line-only version: a living scribble with a face, one animated SVG per mood.

The body is ONE pen line. It lands on the left hand, runs up the arm, scribbles round the
body about two and a half times (so the loops cross), flicks a curl on top for a cowlick,
and lifts off at the right hand. It is drawn as a tapered ink stroke (thin where the pen
lands and lifts, a broad-nib swell in between), which is what makes it read hand-drawn.
SMIL morphs that stroke's `d` through seeded keyframes, so the line crawls and wriggles
instead of just rotating. Face, legs and props use the same pen. Each mood has one accent
colour, so colour alone already tells the moods apart at 60 px.

Model logos are NOT drawn here: line.html loads them from a pinned CDN (simple-icons) and
shows a text chip when a logo cannot load.

    python3 characters/jason/build_line.py

Writes line/jason-line-<mood>.svg (9 files), logos.json and line.html. Stdlib only and
seeded, so every run writes the same bytes. Under prefers-reduced-motion the CSS motion
(bounce, shake, blink, props) stops; the line wriggle (SMIL) keeps going, because it is the
character itself. Set STILL_ON_REDUCED_MOTION = True to freeze the wriggle too.
"""
import json
import math
import random
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "line"
INK = "#1d1b18"
RED, ORANGE, GOLD, BLUE, PINK, GREY = "#dc2626", "#f97316", "#eab308", "#2563eb", "#db2777", "#8a8377"
TAU = 2 * math.pi
K = 6                 # wriggle keyframes per loop; the loop closes on a copy of frame 0
N_LOOP = 104          # samples along the scribble loops (same count in every keyframe)
SIMPLE_ICONS = "simple-icons@16.32.0"   # published 2026-09-20, two weeks older than today
STILL_ON_REDUCED_MOTION = False   # True: also swap each wriggling path for a still copy of frame 0


# ---------- path data ----------
# Points are rounded once, absolutely, to 0.1 units. After the first M every command is a
# relative step between rounded points, so paths stay short and never drift.

def _q(v):
    return int(round(v * 10))


def _num(t):
    whole, frac = divmod(abs(t), 10)
    s = f"{whole}.{frac}" if frac else str(whole)
    if s.startswith("0."):
        s = s[1:]
    return "-" + s if t < 0 else s


def _nums(vals):
    out = ""
    for v in vals:
        s = _num(v)
        out += s if (not out or s[0] == "-") else " " + s
    return out


class Pen:
    def __init__(self):
        self.out, self.cur = [], (0, 0)

    def _step(self, p):
        q = (_q(p[0]), _q(p[1]))
        return q, (q[0] - self.cur[0], q[1] - self.cur[1])

    def _put(self, letter, vals, q):
        self.out.append(letter + _nums(vals))
        self.cur = q
        return self

    def move(self, p):
        q = (_q(p[0]), _q(p[1]))
        return self._put("M", q, q)

    def line(self, p):
        q, r = self._step(p)
        return self._put("l", r, q)

    def cubic(self, c1, c2, p):
        r1, r2 = self._step(c1)[1], self._step(c2)[1]
        q, r = self._step(p)
        return self._put("c", r1 + r2 + r, q)

    def quad(self, c, p):
        r1 = self._step(c)[1]
        q, r = self._step(p)
        return self._put("q", r1 + r, q)

    def arc(self, p, r, sweep):
        q, step = self._step(p)
        rr = _num(max(_q(r), 1))
        tail = _nums(step)
        self.out.append(f"a{rr} {rr} 0 0 {sweep}{'' if tail[0] == '-' else ' '}{tail}")
        self.cur = q
        return self

    def curve(self, pts, closed=False):
        """Uniform Catmull-Rom through pts, starting at the current point pts[0]. The first
        segment is a 'c' and the rest are 's': for this spline each segment's first control
        point mirrors the previous segment's second one, which is exactly what 's' means."""
        n = len(pts)
        for i in range(n if closed else n - 1):
            if closed:
                p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
            else:
                p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, n - 1)]
            c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
            r2 = self._step(c2)[1]
            q, r = self._step(p2)
            if i == 0:
                c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
                self._put("c", self._step(c1)[1] + r2 + r, q)
            else:
                self._put("s", r2 + r, q)
        return self

    def close(self):
        self.out.append("z")
        return self

    def d(self):
        return "".join(self.out)


def curve(pts, closed=False):
    pen = Pen().move(pts[0]).curve(pts, closed)
    return (pen.close() if closed else pen).d()


def polyline(pts, closed=False):
    pen = Pen().move(pts[0])
    for p in pts[1:]:
        pen.line(p)
    return (pen.close() if closed else pen).d()


# ---------- geometry ----------

def _smooth(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def _cr(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return tuple(0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3)
                 for a, b, c, d in zip(p0, p1, p2, p3))


def _densify(pts, counts):
    """Subdivide each segment counts[i] times along the spline. The counts are fixed per
    mood, so every keyframe keeps the same number of points (SMIL needs that)."""
    n = len(pts)
    out = [pts[0]]
    for i in range(n - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, n - 1)]
        for j in range(1, counts[i] + 1):
            out.append(_cr(p0, p1, p2, p3, j / counts[i]))
    return out


def _rot(pts, deg, cx, cy):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c) for x, y in pts]


def off(p, dx, dy):
    return (p[0] + dx, p[1] + dy)


# ---------- the ink stroke ----------

def ink_widths(pts, w, tip=0.9, land=14.0, lift=16.0, nib=-0.6, phase=0.0):
    """Pen pressure along a stroke: a broad-nib swell (thick across the nib angle, thin
    along it), a slow pressure wobble, and tapers where the pen lands and lifts."""
    acc = [0.0]
    for p, q in zip(pts, pts[1:]):
        acc.append(acc[-1] + math.dist(p, q))
    total = acc[-1] or 1.0
    n = len(pts)
    out = []
    for i in range(n):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, n - 1)]
        swell = 0.58 + 0.42 * abs(math.sin(math.atan2(b[1] - a[1], b[0] - a[0]) - nib))
        press = 1 + 0.1 * math.sin(TAU * 2.3 * acc[i] / total + phase)
        taper = _smooth(acc[i] / land) * _smooth((total - acc[i]) / lift)
        out.append(tip + (w * swell * press - tip) * taper)
    return out


def brush(pts, widths, pen=None):
    """Outline of a variable-width stroke: one side, a round cap, the other side back, a
    round cap. Filled with nonzero winding, so places where the line crosses itself stay
    solid ink, while the space inside the loops stays empty."""
    pen = pen or Pen()
    n = len(pts)
    left, right = [], []
    for i in range(n):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, n - 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        k = widths[i] / 2 / (math.hypot(tx, ty) or 1.0)
        left.append((pts[i][0] - ty * k, pts[i][1] + tx * k))
        right.append((pts[i][0] + ty * k, pts[i][1] - tx * k))
    pen.move(left[0]).curve(left).arc(right[-1], widths[-1] / 2, 0)
    return pen.curve(right[::-1]).arc(left[0], widths[0] / 2, 0).close()


# ---------- the scribble body ----------

BODY = dict(cx=100, cy=114, rx=50, ry=45, w=3.6, wig=2.2, harm=0.045, drift=1.2, rev=2.55,
            cw=True, shL=0.14, shR=0.14,
            curls=((-1.92, 10, 7.5), (2.2, 7, 4.2)))   # (screen angle, half length, size)


def _loop_span(b):
    """Angles where the loops start (left shoulder) and end (right shoulder). Clockwise
    suits arms that hang down, counter-clockwise suits arms that go up."""
    th0 = math.pi - b["shL"]
    target = th0 + (1 if b["cw"] else -1) * b["rev"] * TAU
    return th0, b["shR"] + TAU * round((target - b["shR"]) / TAU)


def _base(b, a, ph, th, th0):
    """Scribble centreline at angle th. Non-integer harmonics make each pass a different
    shape, so passes cross; ph (0..2pi over one loop) drives the travelling wriggle."""
    r = (1 + 0.08 * math.sin(0.5 * abs(th - th0) + a[0])
         + b["harm"] * (0.6 * math.sin(1.6 * th + a[1] + ph) + 0.4 * math.sin(2.7 * th + a[2] - ph)))
    wig = (b["wig"] * (0.7 * math.sin(5.3 * th - ph + a[3]) + 0.3 * math.sin(8.1 * th + ph + a[4]))
           * (0.65 + 0.35 * math.sin(0.9 * th + a[5])))
    ox = 3.8 * math.sin(0.43 * th + a[6]) + b["drift"] * math.cos(ph + a[7])
    oy = 3.0 * math.sin(0.37 * th + a[8]) + 0.6 * b["drift"] * math.sin(ph + a[7])
    return (b["cx"] + ox + (b["rx"] * r + wig) * math.cos(th) * (1 + 0.06 * math.sin(th)),
            b["cy"] + oy + (b["ry"] * r + wig) * math.sin(th))


def _curls(b, a, th0, th1):
    """Put each curl on the outermost pass at its screen angle, so it sticks out."""
    out = []
    span = th1 - th0
    for ang, half, size in b["curls"]:
        best = None
        for m in range(-6, 7):
            th = ang + TAU * m
            u = (th - th0) / span
            if 0.1 < u < 0.9:
                x, y = _base(b, a, 0.0, th, th0)
                rad = math.hypot((x - b["cx"]) / b["rx"], (y - b["cy"]) / b["ry"])
                if best is None or rad > best[0]:
                    best = (rad, u)
        if best:
            out.append((best[1], half / (abs(span) * (b["rx"] + b["ry"]) / 2), size))
    return out


def _grid(n, curls):
    """n loop samples, packed tighter inside the curls so each curl stays round."""
    fine = 4000
    dens = [1 + sum(2.4 * math.exp(-((i / fine - uc) / hu) ** 2) for uc, hu, _ in curls)
            for i in range(fine + 1)]
    cum = [0.0]
    for i in range(fine):
        cum.append(cum[-1] + (dens[i] + dens[i + 1]) / 2)
    grid, j = [], 0
    for k in range(n):
        target = cum[-1] * k / (n - 1)
        while j < fine - 1 and cum[j + 1] < target:
            j += 1
        grid.append(min(1.0, (j + (target - cum[j]) / (cum[j + 1] - cum[j])) / fine))
    return grid


def _loop(b, a, ph, grid, th0, th1, curls, lean=0.3):
    pts = []
    for u in grid:
        th = th0 + (th1 - th0) * u
        x, y = _base(b, a, ph, th, th0)
        for uc, hu, size in curls:
            v = (u - uc) / hu
            if -1 < v < 1:   # a prolate-cycloid loop: out, back over itself, and on
                x1, y1 = _base(b, a, ph, th0 + (th1 - th0) * (u - 1e-4), th0)
                x2, y2 = _base(b, a, ph, th0 + (th1 - th0) * (u + 1e-4), th0)
                ln = math.hypot(x2 - x1, y2 - y1) or 1.0
                tx, ty = (x2 - x1) / ln, (y2 - y1) / ln
                nx, ny = -ty, tx
                if (x - b["cx"]) * nx + (y - b["cy"]) * ny < 0:
                    nx, ny = ty, -tx
                on = size * (1 + math.cos(math.pi * v))
                ot = -size * math.sin(math.pi * v) + lean * on
                x, y = x + ot * tx + on * nx, y + ot * ty + on * ny
        pts.append((x, y))
    return pts


def _hand(offs, kind, size, turn):
    """Finish an arm with a little curl: 'hook' is an open hand, 'fist' a closed loop."""
    (x0, y0), (x1, y1) = offs[-2], offs[-1]
    ln = math.hypot(x1 - x0, y1 - y0) or 1.0
    dx, dy = (x1 - x0) / ln, (y1 - y0) / ln
    nx, ny = -dy * turn, dx * turn
    cx, cy = x1 + nx * size, y1 + ny * size
    stops = (0.9, 1.8, 2.7) if kind == "hook" else (0.8, 1.6, 2.4, 3.2, 4.0, 4.8, 5.6, 6.5)
    return list(offs) + [(cx - nx * size * math.cos(f) + dx * size * math.sin(f),
                          cy - ny * size * math.cos(f) + dy * size * math.sin(f)) for f in stops]


def ARMS(offs, hand=None, swing=4.0, left=None, lhand=None, **kw):
    """Arm offsets are (out, down) from the shoulder; the left arm mirrors the right one
    unless it is given separately."""
    right = _hand(offs, *hand) if hand else list(offs)
    lft = right if left is None else (_hand(left, *lhand) if lhand else list(left))
    return dict(L=lft, R=right, swing=swing, **kw)


def LEGS(hx, offs, swing=2.0, **kw):
    return dict(hx=hx, offs=offs, swing=swing, **kw)


def _limb(root, side, offs, swing):
    """Place (out, down) offsets at root, mirrored for side -1, raised by swing degrees."""
    a = math.radians(-side * swing)
    c, s = math.cos(a), math.sin(a)
    return [(root[0] + side * o * c - d * s, root[1] + side * o * s + d * c) for o, d in offs]


def _swing(cfg, ph, side):
    lag = 0.0 if (cfg.get("sync", True) or side < 0) else math.pi
    return cfg["swing"] * math.sin(cfg.get("freq", 1) * ph + lag)


def body_frames(b, arms, a):
    th0, th1 = _loop_span(b)
    curls = _curls(b, a, th0, th1)
    grid = _grid(N_LOOP, curls)
    lines = []
    for k in range(K):
        ph = TAU * k / K
        loop = _loop(b, a, ph, grid, th0, th1, curls)
        if "absR" in arms:   # hands that must meet at one fixed spot (the wai)
            right = [off(loop[-1], 1, 9)] + list(arms["absR"])
            left = [off(loop[0], -1, 9)] + [(2 * b["cx"] - x, y) for x, y in arms["absR"]]
        else:
            left = _limb(loop[0], -1, arms["L"], _swing(arms, ph, -1))
            right = _limb(loop[-1], 1, arms["R"], _swing(arms, ph, 1))
        lines.append(left[::-1] + loop + right)
    counts = [max(1, round(math.dist(p, q) / 6)) for p, q in zip(lines[0], lines[0][1:])]
    frames = []
    for line in lines:
        pts = _densify(line, counts)
        frames.append(brush(pts, ink_widths(pts, b["w"], phase=a[9])).d())
    return frames


def legs_frames(b, lg):
    frames = []
    for k in range(K):
        ph = TAU * k / K
        pen = Pen()
        for side in (-1, 1):
            hip = (b["cx"] + side * lg["hx"], b["cy"] + b["ry"] * 0.8)
            if lg.get("tap"):    # only the right foot taps
                sw = lg["swing"] * max(0.0, math.sin(lg.get("freq", 1) * ph)) if side > 0 else 0.0
            else:
                sw = _swing(dict(lg, sync=lg.get("sync", False)), ph, side)
            offs = lg.get("left", lg["offs"]) if side < 0 else lg["offs"]
            pts = _densify([hip] + _limb(hip, side, offs, sw), [3] * len(offs))
            brush(pts, ink_widths(pts, 3.3, tip=1.0, land=7.0, lift=6.0), pen)
        frames.append(pen.d())
    return frames


def burst_frames(rnd, cx, cy, r_out, r_in, n=11, n_frames=6):
    frames = []
    lean = [rnd.uniform(-0.12, 0.12) for _ in range(2 * n)]
    for _ in range(n_frames):
        pts = []
        for j in range(2 * n):
            ang = TAU * (j + lean[j]) / (2 * n) - math.pi / 2
            r = (r_out if j % 2 == 0 else r_in) * (1 + rnd.uniform(-0.15, 0.15))
            pts.append((cx + r * math.cos(ang), cy + r * math.sin(ang)))
        frames.append(polyline(pts, closed=True))
    return frames


# ---------- face and props (same pen, round caps) ----------

def dot(c, r, rot=0.0, turns=1.75, n=15):
    """A scribbled-in eye: a tight spiral that reads as a solid dot when small."""
    return curve([(c[0] + r * (0.2 + 0.8 * f) * math.cos(rot + TAU * turns * f),
                   c[1] + r * 1.1 * (0.2 + 0.8 * f) * math.sin(rot + TAU * turns * f))
                  for f in (i / (n - 1) for i in range(n))])


def ring(c, rx, ry=None, rot=-1.9, over=0.16, grow=0.08, n=16, tilt=0.0):
    """A hand-drawn ellipse: the pen goes round a little more than once and lands just
    outside where it started."""
    ry = rx if ry is None else ry
    pts = []
    for i in range(n + 1):
        f = i / n
        a = rot + TAU * (1 + over) * f
        g = 1 - grow / 2 + grow * f
        pts.append((c[0] + rx * g * math.cos(a), c[1] + ry * g * math.sin(a)))
    return curve(_rot(pts, tilt, *c) if tilt else pts)


def sparkle(c, r):
    """Four-point twinkle with pinched sides (not an asterisk)."""
    x, y = c
    s = r * 0.2
    pen = Pen().move((x, y - r))
    pen.quad((x + s, y - s), (x + r, y)).quad((x + s, y + s), (x, y + r))
    pen.quad((x - s, y + s), (x - r, y)).quad((x - s, y - s), (x, y - r))
    return pen.close().d()


def drop(c, r, h):
    """Teardrop: pointed top, round bottom of radius r centred on c, tip h above c."""
    x, y = c
    pen = Pen().move((x, y - h))
    pen.cubic((x + 0.35 * r, y - 0.6 * h), (x + r, y - 0.8 * r), (x + r, y))
    pen.arc((x - r, y), r, 1)
    pen.cubic((x - r, y - 0.8 * r), (x - 0.35 * r, y - 0.6 * h), (x, y - h))
    return pen.close().d()


def vein(c, s=1.0):
    """Manga anger mark: four bent strokes with their corners towards the middle."""
    x, y = c
    g, ln = 2.6 * s, 9.5 * s
    pen = Pen()
    for sx, sy in ((1, -1), (1, 1), (-1, 1), (-1, -1)):
        pen.move((x + sx * g, y + sy * ln)).quad((x + sx * g, y + sy * g), (x + sx * ln, y + sy * g))
    return pen.d()


def heart(c, s, over=0.25, n=28):
    """Heart drawn in one go from the bottom tip; the stroke overshoots and crosses there."""
    pts = []
    for i in range(n + 1):
        t = math.pi - over + (TAU + 2 * over) * i / n
        pts.append((c[0] + 16 * s * math.sin(t) ** 3,
                    c[1] - s * (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))))
    return curve(pts)


def cloud(c, w, h, n=48):
    """Sulk cloud: three scallops on top, flat bottom."""
    pts = []
    for i in range(n):
        t = TAU * i / n
        if math.sin(t) < -1e-9:
            k = 1 + 0.5 * abs(math.sin(3 * (t - math.pi)))
            pts.append((c[0] + w * math.cos(t) * (0.9 + 0.1 * k), c[1] + h * math.sin(t) * k))
        else:
            pts.append((c[0] + 0.93 * w * math.cos(t), c[1] + 0.55 * h))
    return curve(pts, closed=True)


def S(d, w=3.4, color=None, cls=None, delay=None):
    attrs = f'd="{d}" stroke-width="{w}"' + (f' stroke="{color}"' if color else "")
    return G(cls, f"<path {attrs}/>", delay) if cls else f"<path {attrs}/>"


def G(cls, inner, delay=None):
    style = f' style="animation-delay:{delay}s"' if delay is not None else ""
    return f'<g class="{cls}"{style}>{inner}</g>'


def animated(frames, dur):
    """A morphing path; the loop closes on a copy of frame 0. With STILL_ON_REDUCED_MOTION it
    also gets a still twin that reduced-motion CSS shows in its place."""
    vals = ";".join(frames + frames[:1])
    path = (f'<path class="wig" d="{frames[0]}"><animate attributeName="d" dur="{dur}s" '
            f'repeatCount="indefinite" values="{vals}"/></path>')
    return path + (f'\n      <path class="still" d="{frames[0]}"/>' if STILL_ON_REDUCED_MOTION else "")


# ---------- moods ----------
# mood       face (what still reads at 60 px)          pose                       accent            motion
# neutral    dot eyes, small smile                     arms relaxed               -                 bob, blink
# demanding  half-lid look-down, one brow up, smirk    hands on hips, foot tap    ink crown         boss bounce
# watching   big ring eyes, scanning pupils, "o"       arms tucked, leaning in    -                 slow lean
# passed     ^ ^ eyes, open grin                       arms up, waving            gold halo+sparks  hop
# retry      - - eyes, wobbly mouth (-_-;)             shrug                      blue sweat drop   head tilt
# annoyed    V brows, hard dots, frown                 fists up, shaking          red anger marks   shake, fast wriggle
# sulking    looks away, sad brows, pout               small, low, limp, greyed   grey cloud+rain   slow sway
# rage_quit  > < eyes under V brows, shouting mouth     running off, flailing      orange burst      jitter, fast stride
# forgive    closed happy eyes, blush, soft smile      hands together (wai)       pink heart+tear   float

MOODS = {
    "neutral": dict(
        dur=3.2, motion="bob",
        arms=ARMS([(6, 5), (11, 12), (14, 20)], ("hook", 2.4, -1), swing=6),
        legs=LEGS(13, [(0, 9), (1, 18), (6, 21)], swing=3),
    ),
    "demanding": dict(
        dur=2.4, motion="boss", face=(0, -4),
        body=dict(ry=47, wig=2.6, shL=0.02, shR=0.02),
        arms=ARMS([(8, 1), (16, 6), (19, 13), (11, 20), (-3, 23)], ("fist", 2.0, 1), swing=3),
        legs=LEGS(16, [(3, 9), (6, 18), (12, 20)], swing=12, freq=2, tap=True),
    ),
    "watching": dict(
        dur=3.6, motion="lean", tilt=4,
        body=dict(wig=1.6, harm=0.025, drift=0.8),
        arms=ARMS([(5, 8), (9, 17)], ("hook", 2.4, -1), swing=2),
        legs=LEGS(12, [(0, 9), (0, 18), (5, 21)], swing=1),
    ),
    "passed": dict(
        dur=1.6, motion="hop", face=(0, -2),
        body=dict(wig=2.6, cw=False, shL=-0.28, shR=-0.28),
        arms=ARMS([(5, -6), (10, -14), (13, -23), (14, -31)], ("hook", 2.6, 1), swing=12),
        legs=LEGS(12, [(2, 8), (5, 16), (10, 18)], swing=10, sync=True),
    ),
    "retry": dict(
        dur=2.4, motion="tilt", tilt=-5,
        body=dict(wig=2.6, shL=0.08, shR=0.08),
        arms=ARMS([(8, 4), (16, 6), (22, 2), (25, -5)], ("hook", 2.4, -1), swing=5),
        legs=LEGS(12, [(0, 9), (1, 18), (-4, 21)], swing=2),
    ),
    "annoyed": dict(
        dur=0.9, motion="shake", face=(0, 1),
        body=dict(rx=53, wig=4.4, harm=0.05, drift=1.6, cw=False, shL=-0.06, shR=-0.06),
        arms=ARMS([(8, -2), (15, -7), (19, -15)], ("fist", 3.0, 1), swing=7, freq=2),
        legs=LEGS(14, [(1, 9), (2, 18), (8, 20)], swing=6, freq=2),
    ),
    "sulking": dict(
        dur=5.0, motion="sway", face=(6, 0), opacity=0.72,
        body=dict(cy=124, rx=43, ry=38, wig=1.2, harm=0.02, drift=0.6, shL=0.25, shR=0.25,
                  curls=((-1.92, 9, 4.0), (2.2, 6, 3.0))),
        arms=ARMS([(3, 7), (5, 14), (5, 20)], ("hook", 2.0, 1), swing=2),
        legs=LEGS(10, [(0, 5), (1, 10), (5, 12)], swing=1),
    ),
    "rage_quit": dict(
        dur=0.7, motion="jitter", tilt=10, face=(2, -2),
        body=dict(cx=112, cy=108, wig=5.5, harm=0.06, drift=2.0, cw=False, shL=-0.3, shR=-0.3),
        arms=ARMS([(8, -6), (14, -14), (16, -23)], ("hook", 2.4, 1), swing=18, sync=False,
                  left=[(9, 1), (17, 4), (25, 2)], lhand=("hook", 2.4, -1)),
        legs=LEGS(10, [(4, 9), (9, 18), (12, 25), (18, 26)], swing=22, freq=2,
                  left=[(5, 9), (12, 17), (15, 24), (10, 25)]),
    ),
    "forgive": dict(
        dur=4.0, motion="float", face=(0, -4),
        body=dict(wig=1.8, harm=0.03, drift=1.0, shL=0.16, shR=0.16),
        arms=dict(absR=[(138, 133), (125, 140), (113, 143), (107, 141), (104.5, 134), (100.8, 126.5)]),
        legs=LEGS(9, [(0, 9), (-1, 18), (-6, 20)], swing=1),
    ),
}


def art(name, cfg, b, rnd):
    """Face strokes, plus props in front of and behind the body, for one mood."""
    fx, fy = cfg.get("face", (0, 0))
    F = (b["cx"] + fx, b["cy"] - 8 + fy)
    EL, ER, M = off(F, -18, 0), off(F, 18, 0), off(F, 0, 15)
    face, front, back = [], [], []

    if name == "neutral":
        face.append(G("fx blink", S(dot(EL, 5), 3.2) + S(dot(ER, 5, 0.7), 3.2)))
        face.append(S(curve([off(M, -10, -2), off(M, -5, 1.8), off(M, 0.5, 3), off(M, 5.5, 1.6), off(M, 10.5, -2.6)]), 3.6))

    elif name == "demanding":
        lids = (S(curve([off(EL, -8, -1.2), off(EL, 0, -2.4), off(EL, 8, -1)]), 3.6)
                + S(curve([off(ER, -8, -1), off(ER, 0, -2.4), off(ER, 8, -1.2)]), 3.6))
        pupils = S(dot(off(EL, 0.5, 2.4), 3.2), 3.0) + S(dot(off(ER, -0.5, 2.4), 3.2, 0.8), 3.0)
        face.append(G("fx blink", lids + pupils))
        face.append(S(curve([off(EL, -8, -9.5), off(EL, 0, -10), off(EL, 8, -8.6)]), 3.2))
        face.append(S(curve([off(ER, -7, -11.5), off(ER, 0, -16), off(ER, 8, -13)]), 3.2))
        face.append(S(curve([off(M, -9, 1.4), off(M, -2, 2.6), off(M, 5, 1.2), off(M, 10, -2.8)]), 3.6))
        crown = [(-12, 0), (-14.5, -13), (-6, -5.5), (0, -16), (6, -5.5), (14.5, -13), (12, 0)]
        crown = _rot([(120 + x, 67 + y) for x, y in crown], 18, 120, 67)
        front.append(S(polyline(crown, closed=True), 2.8, cls="fx wobble"))

    elif name == "watching":
        rings = S(ring(EL, 9.5), 3.0) + S(ring(ER, 9.5, rot=-1.3), 3.0)
        pupils = G("scan", S(dot(off(EL, 0, 1), 3.0), 2.8) + S(dot(off(ER, 0, 1), 3.0, 0.7), 2.8))
        face.append(G("fx blink", rings + pupils))
        face.append(S(curve([off(EL, -7, -15), off(EL, 0, -17.5), off(EL, 7, -15.5)]), 3.0))
        face.append(S(curve([off(ER, -7, -15.5), off(ER, 0, -17.5), off(ER, 7, -15)]), 3.0))
        face.append(S(ring(off(M, 0, 1.5), 3.6, 4.2, rot=-2.2), 3.2))

    elif name == "passed":
        caret = lambda E: curve([off(E, -8, 3.5), off(E, -4.5, -2), off(E, 0, -4.5), off(E, 4.5, -2), off(E, 8, 3.5)])
        face += [S(caret(EL), 4.0), S(caret(ER), 4.0)]
        face.append(S(curve([off(M, -13, -2.5), off(M, -6, -1.4), off(M, 0, -1.2), off(M, 6, -1.4), off(M, 13, -2.5),
                             off(M, 10.5, 5.5), off(M, 4.5, 11), off(M, -4.5, 11), off(M, -10.5, 5.5)], closed=True), 3.6))
        face.append(S(curve([off(M, -5, 9.2), off(M, 0, 5.8), off(M, 5, 9.2)]), 2.6))
        front.append(S(ring((100, 40), 24, 6.5, rot=-2.6, over=0.12, grow=0.1, n=22), 3.2, GOLD, "fx halo"))
        for (x, y, r), dl in zip(((36, 50, 8.5), (166, 44, 6.5), (169, 128, 5.5)), (0, -0.5, -1.0)):
            front.append(S(sparkle((x, y), r), 2.4, GOLD, "fx twinkle", dl))

    elif name == "retry":
        flat = lambda E, s: curve([off(E, -7.5, 0.4 * s), off(E, 0, -0.6), off(E, 7.5, 0.8 * s)])
        face += [S(flat(EL, 1), 4.2), S(flat(ER, -1), 4.2)]
        face.append(S(curve([off(M, -11, 2.6), off(M, -6, -0.4), off(M, -1, 2), off(M, 4, -0.6), off(M, 9, 1.8),
                             off(M, 12, 3.4)]), 3.4))
        front.append(S(drop((152, 80), 6, 14), 2.8, BLUE, "fx drip"))

    elif name == "annoyed":
        face += [S(dot(off(EL, 1, 1.5), 4.2), 3.0), S(dot(off(ER, -1, 1.5), 4.2, 0.9), 3.0)]
        face.append(S(curve([off(EL, -9.5, -12.5), off(EL, -1, -9.6), off(EL, 8, -6)]), 4.6))
        face.append(S(curve([off(ER, 9.5, -12.5), off(ER, 1, -9.6), off(ER, -8, -6)]), 4.6))
        face.append(S(curve([off(M, -12, 5.5), off(M, -6, 0.6), off(M, 0, -1.2), off(M, 6, 0.6), off(M, 12, 5.5)]), 4.0))
        front.append(S(vein((155, 58)), 3.2, RED, "fx pulse"))
        front.append(S(vein((46, 70), 0.7), 2.8, RED, "fx pulse", -0.2))

    elif name == "sulking":
        lid = lambda E: curve([off(E, -7, -1.6), off(E, 0, -1.4), off(E, 7, -0.4)])
        eyes = (S(lid(EL), 3.4) + S(lid(ER), 3.4)
                + S(dot(off(EL, 3.6, 2.4), 2.8), 2.8) + S(dot(off(ER, 3.6, 2.4), 2.8, 0.5), 2.8))
        face.append(G("fx blink", eyes))
        face.append(S(curve([off(EL, -7, -6.5), off(EL, 0, -8.6), off(EL, 6, -10.5)]), 3.0))
        face.append(S(curve([off(ER, -6, -10.5), off(ER, 0, -8.6), off(ER, 7, -6.5)]), 3.0))
        face.append(S(curve([off(M, 2, -3.8), off(M, 6, -2.4), off(M, 3.4, 0), off(M, 6.6, 2.4), off(M, 2.4, 4)]), 3.2))
        cx, cy = b["cx"], b["cy"] - b["ry"] - 30
        rain = "".join(S(polyline([(cx + dx, cy + 14), (cx + dx - 2, cy + 20)]), 2.6, GREY, "rain", dl)
                       for dx, dl in ((-14, 0), (0, -0.35), (14, -0.7)))
        front.append(G("cloud", S(cloud((cx, cy), 29, 9.5), 2.8, GREY) + rain))

    elif name == "rage_quit":
        squeeze = lambda E, s: polyline([off(E, -6 * s, -6.5), off(E, 5 * s, 0), off(E, -6 * s, 6.5)])
        face += [S(squeeze(EL, 1), 4.2), S(squeeze(ER, -1), 4.2)]
        face.append(S(curve([off(EL, -9, -14), off(EL, -1, -11), off(EL, 7, -7.5)]), 4.4))
        face.append(S(curve([off(ER, 9, -14), off(ER, 1, -11), off(ER, -7, -7.5)]), 4.4))
        face.append(S(curve([off(M, -11, 6), off(M, -6.5, -1), off(M, 0, -3.5), off(M, 6.5, -1), off(M, 11, 6),
                             off(M, 5, 9), off(M, -5, 9)], closed=True), 3.8, cls="fx shout"))
        back.append(f'<g stroke="{ORANGE}" stroke-width="3.2">' + animated(burst_frames(rnd, 40, 56, 29, 15), 0.5) + "</g>")
        for (x0, x1, y), dl in zip(((10, 34, 128), (6, 30, 141), (12, 32, 154)), (0, -0.17, -0.34)):
            back.append(S(curve([(x0, y), ((x0 + x1) / 2, y - 1.2), (x1, y + 0.4)]), 2.6, cls="speed", delay=dl))

    elif name == "forgive":
        closed_eye = lambda E: curve([off(E, -7.5, -1.5), off(E, -3.6, 2.2), off(E, 0, 3.2), off(E, 3.6, 2.2), off(E, 7.5, -1.5)])
        face += [S(closed_eye(EL), 3.6), S(closed_eye(ER), 3.6)]
        face.append(S(curve([off(EL, -7, -8.5), off(EL, 0, -10.2), off(EL, 6.5, -11)]), 2.8))
        face.append(S(curve([off(ER, -6.5, -11), off(ER, 0, -10.2), off(ER, 7, -8.5)]), 2.8))
        face.append(S(curve([off(M, -6.5, 0), off(M, 0, 3), off(M, 6.5, 0)]), 3.4))
        front.append("".join(S(polyline([off(E, -5 + i * 4.5, 13.5), off(E, -2.5 + i * 4.5, 9)]), 2.2, PINK)
                             for E in (EL, ER) for i in range(3)))
        front.append(S(drop(off(EL, -10.5, 12), 3.2, 7.5), 2.4, PINK, "fx drip"))
        front.append(S(heart((100, 42), 0.62), 3.0, PINK, "fx beat"))

    return face, front, back


CSS_BASE = (".m{transform-box:view-box;transform-origin:100px 168px}"
            ".fx{transform-box:fill-box;transform-origin:center}"
            + (".still{display:none}@media (prefers-reduced-motion:reduce){*{animation:none!important}"
               ".wig{display:none}.still{display:inline}}" if STILL_ON_REDUCED_MOTION else
               "@media (prefers-reduced-motion:reduce){*{animation:none!important}}"))

CSS = {   # only the rules a mood actually uses are written into its SVG
    "bob": ".bob{animation:bob 2.6s ease-in-out infinite}@keyframes bob{50%{transform:translateY(-3px)}}",
    "boss": ".boss{animation:boss 1.2s ease-in-out infinite}@keyframes boss{0%,100%{transform:none}30%{transform:translateY(-3px) scale(1.01)}}",
    "lean": ".lean{animation:lean 4s ease-in-out infinite}@keyframes lean{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2.5deg)}}",
    "hop": ".hop{animation:hop .8s ease-in-out infinite}@keyframes hop{0%,100%{transform:translateY(0) scale(1.03,.97)}50%{transform:translateY(-10px) scale(.98,1.03)}}",
    "tilt": ".tilt{animation:tilt 2.6s ease-in-out infinite}@keyframes tilt{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(2deg)}}",
    "shake": ".shake{animation:shake .16s linear infinite}@keyframes shake{25%{transform:translateX(-2.5px)}75%{transform:translateX(2.5px)}}",
    "sway": ".sway{animation:sway 5s ease-in-out infinite}@keyframes sway{0%,100%{transform:rotate(-1.5deg)}50%{transform:rotate(1.5deg)}}",
    "jitter": ".jitter{animation:jitter .18s linear infinite}@keyframes jitter{25%{transform:translate(1.5px,-1px) rotate(1deg)}75%{transform:translate(-1px,1px) rotate(-1deg)}}",
    "float": ".float{animation:float 3.2s ease-in-out infinite}@keyframes float{50%{transform:translateY(-5px)}}",
    "blink": ".blink{animation:blink 4.2s infinite}@keyframes blink{0%,92%,100%{transform:none}96%{transform:scaleY(.12)}}",
    "scan": ".scan{animation:scan 3.4s ease-in-out infinite}@keyframes scan{0%,15%,100%{transform:translateX(-3px)}45%,70%{transform:translateX(3px)}}",
    "twinkle": ".twinkle{animation:twinkle 1.6s ease-in-out infinite}@keyframes twinkle{0%,100%{transform:scale(.55);opacity:.35}50%{transform:scale(1);opacity:1}}",
    "halo": ".halo{animation:halo 2.2s ease-in-out infinite}@keyframes halo{50%{transform:translateY(-3px) rotate(-3deg)}}",
    "drip": ".drip{animation:drip 1.8s ease-in infinite}@keyframes drip{0%{transform:translateY(-2px);opacity:0}15%,75%{opacity:1}100%{transform:translateY(7px);opacity:0}}",
    "pulse": ".pulse{animation:pulse .45s ease-in-out infinite alternate}@keyframes pulse{from{transform:scale(.82)}to{transform:scale(1.1)}}",
    "cloud": ".cloud{animation:cloud 4s ease-in-out infinite}@keyframes cloud{50%{transform:translateX(3px)}}",
    "rain": ".rain{animation:rain 1s linear infinite}@keyframes rain{0%{transform:translateY(-3px);opacity:0}25%{opacity:1}100%{transform:translateY(9px);opacity:0}}",
    "beat": ".beat{animation:beat 1.3s ease-in-out infinite}@keyframes beat{0%,30%,60%,100%{transform:scale(1)}15%{transform:scale(1.16)}45%{transform:scale(1.08)}}",
    "speed": ".speed{animation:speed .5s linear infinite}@keyframes speed{0%{transform:translateX(6px);opacity:0}30%{opacity:1}100%{transform:translateX(-8px);opacity:0}}",
    "shout": ".shout{animation:shout .28s ease-in-out infinite alternate}@keyframes shout{from{transform:scale(.92,.8)}to{transform:scale(1.04,1.08)}}",
    "wobble": ".wobble{animation:wobble 1.4s ease-in-out infinite}@keyframes wobble{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(4deg)}}",
}

PEN_G = f'<g fill="none" stroke="{INK}" stroke-linecap="round" stroke-linejoin="round">'


def build(name):
    cfg = MOODS[name]
    rnd = random.Random(f"jason-line-{name}")
    a = [rnd.uniform(0, TAU) for _ in range(10)]
    b = dict(BODY, **cfg.get("body", {}))
    body = animated(body_frames(b, cfg["arms"], a), cfg["dur"])
    legs = animated(legs_frames(b, cfg["legs"]), cfg["dur"])
    face, front, back = art(name, cfg, b, rnd)
    tilt = cfg.get("tilt", 0)
    tilt_attr = f' transform="rotate({tilt} {b["cx"]} {b["cy"] + b["ry"]})"' if tilt else ""
    op = f' opacity="{cfg["opacity"]}"' if "opacity" in cfg else ""
    nl = "\n      "
    markup = (f'  <g class="m {cfg["motion"]}">\n'
              + (f"    {PEN_G}{nl}{nl.join(back)}\n    </g>\n" if back else "")
              + f"    <g{tilt_attr}{op}>\n"
              + f'    <g fill="{INK}">{nl}{legs}{nl}{body}\n    </g>\n'
              + f"    {PEN_G}{nl}{nl.join(face)}\n    </g>\n"
              + (f"    {PEN_G}{nl}{nl.join(front)}\n    </g>\n" if front else "")
              + "    </g>\n  </g>\n")
    css = CSS_BASE + "".join(rule for key, rule in CSS.items()
                             if re.search(r'class="[^"]*\b' + key + r'\b', markup))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">\n'
            f"  <title>Jason line · {name}</title>\n  <style>{css}</style>\n{markup}</svg>\n")


# ---------- gallery + logo set ----------

LOGOS = [
    {"id": "claude", "name": "Claude"},
    {"id": "anthropic", "name": "Anthropic"},
    {"id": "googlegemini", "name": "Gemini"},
    {"id": "meta", "name": "Meta (Llama)"},
    {"id": "deepseek", "name": "DeepSeek"},
    {"id": "ollama", "name": "Ollama"},
    {"id": "perplexity", "name": "Perplexity"},
    {"id": "huggingface", "name": "Hugging Face"},
    {"id": None, "name": "ChatGPT", "note": "ไม่มีในชุด simple-icons จึงใช้ป้ายข้อความ"},
]

STATES = ["neutral", "demanding", "watching", "passed", "retry", "annoyed", "sulking", "rage_quit", "forgive"]
TH = {"neutral": "ปกติ", "demanding": "ไหว้กูซะ", "watching": "กำลังดู", "passed": "ไหว้ผ่าน", "retry": "ไหว้ใหม่ ไม่สวย",
      "annoyed": "โกรธ", "sulking": "งอน", "rage_quit": "หนีไปแล้ว", "forgive": "ขอขมา"}


def gallery_html(manifest):
    cards = "\n    ".join(
        f'<figure><div class="stage"><img class="big" src="line/jason-line-{s}.svg" alt="{TH[s]}">'
        f'<img class="tiny" src="line/jason-line-{s}.svg" alt=""></div>'
        f'<figcaption><b>{s.upper()}</b><span>{TH[s]}</span></figcaption></figure>'
        for s in STATES)
    return f"""<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Jason line gallery</title>
<style>
  :root {{ --bg:#f5f2ec; --fg:#1d1b18; --muted:#6d675e; --card:#fffdf8; --line:#ddd6c8; }}
  @media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg:#161411; --fg:#f1ece2; --muted:#a39b8d; --card:#1f1c18; --line:#3a352d; }} }}
  :root[data-theme="dark"] {{ --bg:#161411; --fg:#f1ece2; --muted:#a39b8d; --card:#1f1c18; --line:#3a352d; }}
  body {{ margin:0; background:var(--bg); color:var(--fg); font:14px/1.5 "Noto Sans Thai", system-ui, sans-serif; padding:0 16px; }}
  main {{ max-width:980px; margin:0 auto; padding-block:28px 56px; }}
  h1 {{ font-size:26px; margin:0 0 4px; }} h2 {{ font-size:16px; margin:32px 0 10px; }}
  .sub {{ color:var(--muted); margin:0 0 16px; }}
  .grid {{ display:grid; gap:12px; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); }}
  figure {{ margin:0; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:12px; text-align:center; min-width:0; }}
  figure img {{ width:100%; max-width:170px; height:auto; display:block; margin:0 auto; }}
  /* the ink is dark, so the character always sits on paper, also in dark mode */
  .stage {{ background:#fffdf8; border-radius:10px; padding:6px; display:flex; align-items:flex-end; justify-content:center; gap:6px; margin-bottom:8px; }}
  .stage img.big {{ flex:1 1 auto; min-width:0; max-width:150px; margin:0; }}
  .stage img.tiny {{ flex:none; width:60px; height:60px; margin:0; border-left:1px dashed #e4dccb; padding-left:6px; }}
  figcaption b {{ display:block; }} figcaption span {{ color:var(--muted); font-size:12px; }}
  .logo {{ display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; min-height:120px; }}
  .logo img {{ width:44px; height:44px; object-fit:contain; }}
  .logo img.inv {{ filter:none; }}
  :root:not([data-theme="light"]) .logo img {{ filter:invert(1); }}
  :root[data-theme="dark"] .logo img {{ filter:invert(1); }}
  .chip {{ font-size:13px; font-weight:700; padding:6px 12px; border-radius:999px; background:var(--fg); color:var(--bg); }}
  .note {{ color:var(--muted); font-size:12px; margin-top:8px; }}
</style>
</head>
<body>
<main>
  <h1>Jason · เส้นยึกยือ</h1>
  <p class="sub">ตัวน้องคือปากกาเส้นเดียวที่ขดวนไปมา ไม่มีพื้นทึบ เส้นดิ้นด้วย SMIL รูปเล็กข้าง ๆ คือขนาดจริง 60 px ส่วนโลโก้โหลดจาก CDN ตอนเปิดหน้า</p>

  <h2>สถานะ</h2>
  <div class="grid">
    {cards}
  </div>

  <h2>โลโก้โมเดล (โหลดจากเน็ต)</h2>
  <p class="sub">ดึงจาก <code>{manifest["base"]}</code> ถ้าโหลดไม่ได้จะแสดงป้ายข้อความแทน</p>
  <div class="grid" id="logos"></div>
  <p class="note">โลโก้เป็นของบริษัทเจ้าของแบรนด์ ตรวจเงื่อนไขการใช้งานก่อนนำไปแจกต่อ</p>
</main>
<script>
  const MANIFEST = {json.dumps(manifest, ensure_ascii=False)};
  const host = document.getElementById("logos");
  for (const item of MANIFEST.logos) {{
    const fig = document.createElement("figure");
    const box = document.createElement("div");
    box.className = "logo";
    if (item.id) {{
      const img = document.createElement("img");
      img.alt = item.name;
      img.src = MANIFEST.base + item.id + ".svg";
      img.onerror = () => {{ img.remove(); box.append(chip(item.name)); }};
      box.append(img);
    }} else {{
      box.append(chip(item.name));
    }}
    const cap = document.createElement("figcaption");
    cap.innerHTML = "<b></b><span></span>";
    cap.querySelector("b").textContent = item.name;
    cap.querySelector("span").textContent = item.id ? item.id : (item.note || "");
    fig.append(box, cap);
    host.append(fig);
  }}
  function chip(text) {{
    const s = document.createElement("span");
    s.className = "chip";
    s.textContent = text;
    return s;
  }}
</script>
</body>
</html>
"""


def main():
    OUT.mkdir(exist_ok=True)
    for mood in MOODS:
        (OUT / f"jason-line-{mood}.svg").write_text(build(mood), encoding="utf-8")
    manifest = {
        "pin": SIMPLE_ICONS,
        "base": f"https://cdn.jsdelivr.net/npm/{SIMPLE_ICONS}/icons/",
        "logos": LOGOS,
    }
    (HERE / "logos.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (HERE / "line.html").write_text(gallery_html(manifest), encoding="utf-8")
    print(f"wrote {len(MOODS)} line SVGs to {OUT}, logos.json and line.html")


if __name__ == "__main__":
    main()
