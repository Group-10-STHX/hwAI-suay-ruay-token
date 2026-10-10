"""Replay the wai heuristic on recorded JSON (from recorder.html) and report how well each label is matched.

    python3 vision/playground/tune.py ~/Downloads/wai-*.json
    python3 vision/playground/tune.py a.json b.json --grid   # also search thresholds

The features in each frame are the same ones recorder.html computed, so this replays the
one-frame classifier only (no majority filter). Stdlib only.
"""

import argparse
import itertools
import json
from pathlib import Path

LEVELS = [0, 1, 2, 3]
BASE = dict(
    gapMax=0.45,
    centerMax=0.5,
    fingersUpMin=0.15,
    tipNoseMin=-0.02,
    thumbBrowMin=-0.05,
    bowMinDeg=12,
    neckDropMin=0.08,
)


def classify(F, th):
    if not F:
        return 0
    if not (
        F["gap"] < th["gapMax"]
        and F["center"] < th["centerMax"]
        and F["fingersUp"] > th["fingersUpMin"]
    ):
        return 0
    level = 2 if F["tipNose"] > th["tipNoseMin"] else 1
    if F.get("bow") is not None:
        bowed = F["bow"] > th["bowMinDeg"]
    elif F.get("neckDrop") is not None:
        bowed = F["neckDrop"] > th["neckDropMin"]
    else:
        bowed = True
    if F["thumbBrow"] > th["thumbBrowMin"] and bowed:
        level = 3
    return level


def confusion(frames, th):
    m = {t: {p: 0 for p in LEVELS} for t in LEVELS}
    for f in frames:
        m[f["label"]][classify(f["feat"], th)] += 1
    return m


def recall(m):
    out = {}
    for t in LEVELS:
        n = sum(m[t].values())
        out[t] = m[t][t] / n if n else None
    return out


def show(title, m):
    print(title)
    print("        pred: " + "  ".join(f"{p:>5}" for p in LEVELS) + "   recall")
    rec = recall(m)
    for t in LEVELS:
        n = sum(m[t].values())
        r = "  n/a" if rec[t] is None else f"{rec[t]:5.2f}"
        print(
            f"  true {t}:    "
            + "  ".join(f"{m[t][p]:5d}" for p in LEVELS)
            + f"   {r}  (n={n})"
        )
    print()


def macro(m):
    r = [v for v in recall(m).values() if v is not None]
    return sum(r) / len(r) if r else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument(
        "--grid",
        action="store_true",
        help="search a small threshold grid (macro recall)",
    )
    args = ap.parse_args()

    frames = []
    for path in args.files:
        d = json.loads(path.read_text())
        frames += d["frames"]
        print(
            f"{path.name}: {len(d['frames'])} frames, thresholds used: {d['thresholds']}"
        )
    print(
        f"total frames: {len(frames)}  per label: "
        + ", ".join(f"{t}={sum(1 for f in frames if f['label'] == t)}" for t in LEVELS)
    )
    print()

    show("current thresholds (from recorder.html):", confusion(frames, BASE))

    if args.grid:
        grid = dict(
            gapMax=[0.45, 0.55, 0.7, 0.9, 1.2],
            fingersUpMin=[0.05, 0.1, 0.15],
            tipNoseMin=[-0.1, -0.02, 0.05, 0.15],
            thumbBrowMin=[-0.3, -0.2, -0.1, -0.05, 0.0],
        )
        best = None
        for vals in itertools.product(*grid.values()):
            th = dict(BASE, **dict(zip(grid.keys(), vals)))
            m = confusion(frames, th)
            score = macro(m)
            if best is None or score > best[0]:
                best = (score, th, m)
        print(f"best macro recall = {best[0]:.2f} with:")
        print({k: best[1][k] for k in grid})
        print()
        show("best grid result:", best[2])
        print(
            "Caution: with few attempts per label this overfits. Use it to see which gate blocks which level."
        )


if __name__ == "__main__":
    main()
