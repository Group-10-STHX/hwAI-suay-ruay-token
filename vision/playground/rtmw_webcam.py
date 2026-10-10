# /// script
# requires-python = ">=3.10"
# dependencies = ["rtmlib==0.0.16", "onnxruntime>=1.20"]
# ///
"""Wai playground: RTMW whole-body (133 keypoints incl. both hands) on the webcam.

    uv run vision/playground/rtmw_webcam.py                      # balanced, CoreML
    uv run vision/playground/rtmw_webcam.py --mode lightweight   # faster, less accurate
    uv run vision/playground/rtmw_webcam.py --device cpu
    uv run vision/playground/rtmw_webcam.py --image photo.jpg    # single image, writes *_rtmw.jpg

Keys: c = calibrate upright head (stand straight first), q = quit.
Same heuristic as mediapipe.html so the two models can be compared side by side.
"""

import argparse
import time
from pathlib import Path

import cv2
import numpy as np
from rtmlib import PoseTracker, Wholebody, draw_skeleton

LEVEL_NAMES = [
    "0 none",
    "1 friend",
    "2 elder",
    "3 monk",
]  # cv2.putText cannot draw Thai

# All distances are divided by shoulder width.
TH = dict(
    gap_max=0.45,
    center_max=0.5,
    fingers_up_min=0.15,
    tip_nose_min=-0.02,
    thumb_brow_min=-0.05,
    neck_drop_min=0.08,
    hold_s=0.7,
    kpt_thr=0.3,
)

# COCO-WholeBody: 0-16 body, 17-22 feet, 23-90 face (68 pts), 91-111 left hand, 112-132 right hand
NOSE, L_EYE, R_EYE, L_SH, R_SH, L_WR, R_WR = 0, 1, 2, 5, 6, 9, 10
FACE_NOSE_TIP = 23 + 30
FACE_INNER_BROWS = [23 + 21, 23 + 22]
L_HAND, R_HAND = 91, 112  # offsets: +4 thumb tip, +8 index tip, +12 middle tip


class WaiHeuristic:
    def __init__(self):
        self.ema = {}
        self.calib_neck = None
        self.last_neck = None
        self.prev_level = 0
        self.hold = 0.0

    def smooth(self, key, value, a=0.4):
        prev = self.ema.get(key)
        self.ema[key] = value if prev is None else prev + a * (value - prev)
        return self.ema[key]

    def calibrate(self):
        self.calib_neck = self.last_neck

    def __call__(self, k, s, dt):
        thr = TH["kpt_thr"]
        if s[L_WR] < thr or s[R_WR] < thr:
            self.prev_level, self.hold = 0, 0.0
            return dict(level=0, reason="wrists not visible")

        sw = float(np.linalg.norm(k[L_SH] - k[R_SH]))
        sh_mid = (k[L_SH] + k[R_SH]) / 2
        wr_mid = (k[L_WR] + k[R_WR]) / 2
        tips_y = k[[L_HAND + 8, L_HAND + 12, R_HAND + 8, R_HAND + 12], 1].min()
        thumbs_y = k[[L_HAND + 4, R_HAND + 4], 1].min()
        nose_y = k[FACE_NOSE_TIP, 1] if s[FACE_NOSE_TIP] > thr else k[NOSE, 1]
        if s[FACE_INNER_BROWS].min() > thr:
            brow_y = k[FACE_INNER_BROWS, 1].mean()
        else:
            brow_y = (k[L_EYE, 1] + k[R_EYE, 1]) / 2 - 0.1 * sw
        self.last_neck = (sh_mid[1] - k[NOSE, 1]) / sw

        f = dict(
            gap=self.smooth("gap", np.linalg.norm(k[L_WR] - k[R_WR]) / sw),
            center=self.smooth("center", abs(wr_mid[0] - sh_mid[0]) / sw),
            fingers_up=self.smooth("up", ((k[L_WR, 1] + k[R_WR, 1]) / 2 - tips_y) / sw),
            tip_nose=self.smooth("tip_nose", (nose_y - tips_y) / sw),
            thumb_brow=self.smooth("thumb_brow", (brow_y - thumbs_y) / sw),
            neck_drop=None
            if self.calib_neck is None
            else self.smooth("neck_drop", self.calib_neck - self.last_neck),
            hand_score=float(s[L_HAND : R_HAND + 21].mean()),
        )

        level = 0
        if (
            f["gap"] < TH["gap_max"]
            and f["center"] < TH["center_max"]
            and f["fingers_up"] > TH["fingers_up_min"]
        ):
            level = 2 if f["tip_nose"] > TH["tip_nose_min"] else 1
            bowed = f["neck_drop"] is None or f["neck_drop"] > TH["neck_drop_min"]
            if f["thumb_brow"] > TH["thumb_brow_min"] and bowed:
                level = 3

        self.hold = self.hold + dt if level == self.prev_level else 0.0
        self.prev_level = level
        sym = np.clip(1 - abs(k[L_WR, 1] - k[R_WR, 1]) / (0.3 * sw), 0, 1)
        cen = np.clip(1 - f["center"] / TH["center_max"], 0, 1)
        score = (
            round(100 * (0.4 * sym + 0.3 * cen + 0.3 * min(self.hold, 1.0)))
            if level
            else 0
        )
        return dict(
            level=level, score=score, hold=self.hold, nose_y=nose_y, brow_y=brow_y, **f
        )


def pick_person(keypoints, scores):
    if len(keypoints) == 0:
        return None, None
    i = int(np.argmax(scores.mean(axis=1)))
    return keypoints[i], scores[i]


def overlay(img, r, fps, wai):
    h, w = img.shape[:2]
    for key, color in (("nose_y", (50, 220, 255)), ("brow_y", (50, 150, 255))):
        if key in r:
            cv2.line(img, (0, int(r[key])), (w, int(r[key])), color, 1, cv2.LINE_AA)
    passed = r["level"] > 0 and r.get("hold", 0) >= TH["hold_s"]
    head = f"{LEVEL_NAMES[r['level']]}{'  PASS' if passed else ''}"
    lines = (
        [r["reason"]]
        if "reason" in r
        else [
            f"score {r['score']}  hold {r['hold']:.1f}s",
            f"gap {r['gap']:.2f}  center {r['center']:.2f}  up {r['fingers_up']:.2f}",
            f"tipNose {r['tip_nose']:.2f}  thumbBrow {r['thumb_brow']:.2f}",
            f"neckDrop {'press c' if r['neck_drop'] is None else format(r['neck_drop'], '.2f')}  "
            f"handConf {r['hand_score']:.2f}",
        ]
    )
    cv2.putText(
        img,
        head,
        (12, 44),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.3,
        (0, 255, 0) if passed else (255, 255, 255),
        3,
    )
    for i, text in enumerate([*lines, f"{fps:.0f} fps"]):
        cv2.putText(
            img,
            text,
            (12, 80 + 26 * i),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 255),
            2,
        )
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--mode", default="balanced", choices=["lightweight", "balanced", "performance"]
    )
    ap.add_argument(
        "--device",
        default="mps",
        choices=["mps", "cpu"],
        help="mps = onnxruntime CoreML provider",
    )
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--image", type=Path)
    args = ap.parse_args()

    wai = WaiHeuristic()
    if args.image:
        model = Wholebody(mode=args.mode, backend="onnxruntime", device=args.device)
        img = cv2.imread(str(args.image))
        t0 = time.perf_counter()
        keypoints, scores = model(img)
        ms = (time.perf_counter() - t0) * 1000
        k, s = pick_person(keypoints, scores)
        r = wai(k, s, 0.0) if k is not None else dict(level=0, reason="no person")
        out = draw_skeleton(img.copy(), keypoints, scores, kpt_thr=TH["kpt_thr"])
        out = overlay(out, r, 1000 / ms, wai)
        dst = args.image.with_name(f"{args.image.stem}_rtmw.jpg")
        cv2.imwrite(str(dst), out)
        print(f"{ms:.0f} ms  people={len(keypoints)}  ->  {dst}")
        print({k_: (round(v, 3) if isinstance(v, float) else v) for k_, v in r.items()})
        return

    tracker = PoseTracker(
        Wholebody,
        det_frequency=7,
        mode=args.mode,
        backend="onnxruntime",
        device=args.device,
    )
    cap = cv2.VideoCapture(args.camera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    prev, fps = time.perf_counter(), 0.0
    while cap.isOpened():
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.flip(frame, 1)  # selfie view; the heuristic is left/right symmetric
        now = time.perf_counter()
        dt, prev = now - prev, now
        fps = fps * 0.9 + 0.1 / max(dt, 1e-6)
        keypoints, scores = tracker(frame)
        k, s = pick_person(keypoints, scores)
        r = wai(k, s, dt) if k is not None else dict(level=0, reason="no person")
        out = draw_skeleton(frame.copy(), keypoints, scores, kpt_thr=TH["kpt_thr"])
        cv2.imshow("wai: RTMW", overlay(out, r, fps, wai))
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("c"):
            wai.calibrate()
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
