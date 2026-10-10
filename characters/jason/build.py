#!/usr/bin/env python3
"""Generate Jason, the tangled-line character for hwAI, as one animated SVG per mood.

Stdlib only. The lines are seeded so each run gives the same tangle.

    python3 characters/jason/build.py                   # all moods, no badge
    python3 characters/jason/build.py --badge "Opus 5.5" --out jason-opus
    python3 characters/jason/build.py --seed 11         # a different tangle

Layers (back to front): tangle loops -> face -> mood accessories -> model badge.
Motion is pure CSS inside each SVG, so it runs in a browser, in <img>, and in Electron.
No text in the character itself except the optional badge, so the art can be localized.
"""
import argparse
import json
import math
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
INK = "#1d1b18"
RED = "#dc2626"
ORANGE = "#f97316"
GOLD = "#facc15"
BLUE = "#60a5fa"
PINK = "#f472b6"
GREY = "#9ca3af"

STYLE = """
.mood{transform-box:view-box;transform-origin:100px 100px}
.body{transform-box:view-box;transform-origin:100px 115px;animation:breathe 3s ease-in-out infinite}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.03,.98)}}
.loop{transform-box:view-box;transform-origin:100px 100px;animation:tangle var(--d) ease-in-out infinite alternate}
@keyframes tangle{from{transform:rotate(-3deg)}to{transform:rotate(3deg)}}
.bob{animation:bob 1.6s ease-in-out infinite}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
.hop{animation:hop .8s ease-in-out infinite}
@keyframes hop{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
.shake{animation:shake .16s linear infinite}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}
.droop{transform-box:view-box;transform-origin:100px 185px;transform:translateY(16px) scale(.88,.78);opacity:.7}
.float{animation:float 2.4s ease-in-out infinite}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
.burst{transform-box:fill-box;transform-origin:center;animation:burst 1.1s ease-out infinite}
@keyframes burst{0%{transform:scale(.5);opacity:0}30%{opacity:1}100%{transform:scale(1.25);opacity:0}}
.twinkle{transform-box:fill-box;transform-origin:center;animation:twinkle 1.6s ease-in-out infinite}
@keyframes twinkle{0%,100%{opacity:.2;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}
.drip{animation:drip 1.4s ease-in infinite}
@keyframes drip{0%{transform:translateY(0);opacity:1}100%{transform:translateY(10px);opacity:0}}
.glow{transform-box:fill-box;transform-origin:center;animation:glow 2s ease-in-out infinite}
@keyframes glow{0%,100%{opacity:.25}50%{opacity:.6}}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}
"""


def tangle(rng, cx, cy, R, n=56):
    """One closed, wobbly loop. Points are jittered a little so it reads as hand-drawn."""
    k = rng.choice([2, 3, 4])
    p0, p1 = rng.uniform(0, 6.28), rng.uniform(0, 6.28)
    sx, sy = rng.uniform(0.85, 1.15), rng.uniform(0.85, 1.15)
    pts = []
    for i in range(n + 1):
        t = 2 * math.pi * i / n
        r = R * (1 + 0.16 * math.sin(k * t + p0) + 0.07 * math.sin(2 * k * t + p1)) + rng.uniform(-2.2, 2.2)
        pts.append((cx + r * math.cos(t) * sx, cy + r * math.sin(t) * sy))
    d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts)
    return d


def star(cx, cy, r):
    """Four-point sparkle."""
    s = r * 0.28
    return (f"M{cx} {cy - r} Q{cx + s} {cy - s} {cx + r} {cy} Q{cx + s} {cy + s} {cx} {cy + r} "
            f"Q{cx - s} {cy + s} {cx - r} {cy} Q{cx - s} {cy - s} {cx} {cy - r}Z")


def burst(cx, cy, r1, r2, n=12):
    """Spiky starburst, the anger/rage mark in the sketches."""
    parts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        a2 = a + math.pi / n
        x1, y1 = cx + r2 * math.cos(a), cy + r2 * math.sin(a)
        x2, y2 = cx + r1 * math.cos(a2), cy + r1 * math.sin(a2)
        parts.append(f"M{cx + r1 * math.cos(a):.1f} {cy + r1 * math.sin(a):.1f} L{x1:.1f} {y1:.1f} L{x2:.1f} {y2:.1f}")
    return " ".join(parts)


FACES = {
    "neutral": dict(
        eyes=f'<path d="M80 98 q6 -6 12 0 M108 98 q6 -6 12 0" />',
        mouth='<path d="M92 118 q8 4 16 0" />'),
    "demanding": dict(
        eyes='<circle cx="86" cy="98" r="3.5" fill="%s"/><circle cx="114" cy="98" r="3.5" fill="%s"/>' % (INK, INK),
        mouth='<path d="M92 116 q8 6 16 0" />'),
    "watching": dict(
        eyes='<circle cx="89" cy="94" r="3" fill="%s"/><circle cx="117" cy="94" r="3" fill="%s"/>' % (INK, INK),
        mouth='<path d="M94 118 h12" />'),
    "passed": dict(
        eyes='<path d="M80 100 q6 -9 12 0 M108 100 q6 -9 12 0" />',
        mouth='<path d="M86 116 q14 14 28 0" />'),
    "retry": dict(
        eyes='<circle cx="82" cy="96" r="3" fill="%s"/><circle cx="110" cy="96" r="3" fill="%s"/>' % (INK, INK),
        mouth='<path d="M92 120 h16" />'),
    "annoyed": dict(
        eyes=f'<path d="M78 90 l14 6 M122 90 l-14 6" stroke="{RED}" /><circle cx="86" cy="101" r="3" fill="{INK}"/><circle cx="114" cy="101" r="3" fill="{INK}"/>',
        mouth='<path d="M88 122 l4 -4 l4 4 l4 -4 l4 4 l4 -4 l4 4" />'),
    "sulking": dict(
        eyes='<path d="M80 100 h12 M108 100 h12" />',
        mouth='<path d="M92 124 q8 -5 16 0" />'),
    "rage_quit": dict(
        eyes=f'<path d="M80 92 l10 10 M90 92 l-10 10 M104 92 l10 10 M114 92 l-10 10" stroke="{RED}" />',
        mouth=f'<ellipse cx="100" cy="120" rx="7" ry="6" fill="none" />'),
    "forgive": dict(
        eyes='<path d="M80 99 q6 4 12 0 M108 99 q6 4 12 0" />',
        mouth='<path d="M94 116 q6 4 12 0" />'),
}

ACCESSORY = {
    "neutral": "",
    "demanding": "",
    "watching": f'<path d="M160 40 l8 -8 M168 58 h10" stroke="{GREY}" stroke-width="2.5" />',
    "passed": (f'<ellipse cx="100" cy="30" rx="22" ry="6" fill="none" stroke="{GOLD}" stroke-width="3"/>'
               f'<path class="twinkle" d="{star(44, 48, 9)}" fill="{GOLD}"/>'
               f'<path class="twinkle" style="animation-delay:.5s" d="{star(160, 66, 8)}" fill="{GOLD}"/>'
               f'<path class="twinkle" style="animation-delay:1s" d="{star(40, 132, 7)}" fill="{GOLD}"/>'),
    "retry": (f'<path class="drip" d="M62 72 q-6 10 0 14 q6 -4 0 -14z" fill="{BLUE}"/>'
              f'<path class="drip" style="animation-delay:.7s" d="M140 80 q-5 8 0 11 q5 -3 0 -11z" fill="{BLUE}"/>'),
    "annoyed": (f'<path d="M148 42 q-4 -10 6 -14 M164 62 q4 -8 10 -4 M134 28 q-8 -4 -6 -14" '
                f'stroke="{RED}" stroke-width="4" fill="none"/>'),
    "sulking": (f'<circle cx="150" cy="40" r="2.5" fill="{GREY}"/><circle cx="162" cy="34" r="2.5" fill="{GREY}"/>'
                f'<circle cx="174" cy="40" r="2.5" fill="{GREY}"/>'
                f'<path class="drip" d="M70 150 v8 M84 156 v8 M98 150 v8" stroke="{GREY}" stroke-width="2"/>'),
    "rage_quit": f'<path class="burst" d="{burst(164, 112, 26, 14)}" stroke="{ORANGE}" stroke-width="5" fill="none" stroke-linecap="round"/>',
    "forgive": (f'<circle class="glow" cx="54" cy="120" r="16" fill="{PINK}"/>'
                f'<circle class="glow" style="animation-delay:1s" cx="146" cy="120" r="16" fill="{PINK}"/>'
                f'<path class="float" d="M100 22 c-6 -10 -18 -2 -10 8 l10 9 l10 -9 c8 -10 -4 -18 -10 -8z" fill="{PINK}"/>'
                f'<path class="drip" d="M88 106 q-4 7 0 9 q4 -2 0 -9z" fill="{BLUE}"/>'),
}

MOOD_CLASS = {
    "neutral": "bob", "demanding": "bob", "watching": "bob", "passed": "hop",
    "retry": "bob", "annoyed": "shake", "sulking": "droop", "rage_quit": "float", "forgive": "float",
}

# Which mood is "lively" decides how much the tangle moves.
TANGLE_SPEED = {"neutral": 3.4, "demanding": 3.0, "watching": 3.8, "passed": 2.2,
                "retry": 3.2, "annoyed": 1.2, "sulking": 5.5, "rage_quit": 1.6, "forgive": 4.0}


def body(rng, mood):
    loops = []
    for i in range(7):
        cx = 100 + rng.uniform(-14, 14)
        cy = 108 + rng.uniform(-12, 12)
        R = rng.uniform(36, 50)
        d = tangle(rng, cx, cy, R)
        width = rng.uniform(2.6, 3.2)
        dur = TANGLE_SPEED[mood] * rng.uniform(0.8, 1.2)
        loops.append(f'<path class="loop" style="--d:{dur:.2f}s" d="{d}" fill="none" '
                     f'stroke="{INK}" stroke-width="{width:.2f}" stroke-linecap="round" stroke-linejoin="round"/>')
    return "\n    ".join(loops)


def badge(text):
    if not text:
        return ""
    return (f'<rect x="56" y="170" width="88" height="20" rx="10" fill="{INK}"/>'
            f'<text x="100" y="184" text-anchor="middle" font-family="system-ui, sans-serif" '
            f'font-size="11" font-weight="700" fill="#f5f2ec">{text}</text>')


def build_mood(mood, seed, badge_text):
    rng = random.Random(f"{seed}-{mood}")  # same tangle per mood, reproducible
    face = FACES[mood]
    mood_cls = MOOD_CLASS[mood]
    sulk_wrap = ("droop" if mood == "sulking" else "")
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <title>Jason · {mood}</title>
  <style>{STYLE}</style>
  <g class="mood {mood_cls}">
    <g class="body {sulk_wrap}">
    {body(rng, mood)}
    </g>
    <g class="face" fill="none" stroke="{INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
      {face["eyes"]}
      {face["mouth"]}
    </g>
    {ACCESSORY[mood]}
    {badge(badge_text)}
  </g>
</svg>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", default="jason")
    ap.add_argument("--badge", default="", help="model name shown on the body, e.g. 'Opus 5.5'")
    ap.add_argument("--out", default="", help="file prefix; default writes jason-<mood>.svg")
    args = ap.parse_args()

    prefix = args.out or "jason"
    out_dir = HERE / "moods"
    out_dir.mkdir(exist_ok=True)
    for mood in FACES:
        svg = build_mood(mood, args.seed, args.badge)
        (out_dir / f"{prefix}-{mood}.svg").write_text(svg, encoding="utf-8")

    states = {
        "idle": "neutral", "demanding": "demanding", "watching": "watching", "passed": "passed",
        "retry": "retry", "annoyed": "annoyed", "sulking": "sulking",
        "rage_quit": "rage_quit", "forgive": "forgive",
    }
    (HERE / "character.json").write_text(json.dumps({
        "name": "Jason",
        "style": "tangle-line",
        "engine": "svg",
        "states": {k: f"moods/{prefix}-{v}.svg" for k, v in states.items()},
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(FACES)} SVGs to {out_dir} and character.json")


if __name__ == "__main__":
    main()
