# MediaPipe tuning report (Agent A)

Scope: `playground/mediapipe.html`. No live camera was used. Everything below came from a headless browser fed a looping still image, and from the Python package run on 3 stills.

## Bugs fixed (4 small edits in mediapipe.html)
1. Profile or far-away person: shoulder width `sw` collapses (about 10 px in the Koh_Samui image), so every ratio explodes. Added a guard: `sw < 0.08 * W` returns level 0 with the reason "หันหน้าเข้ากล้อง / เข้าใกล้อีกนิด".
2. Level 3 could fire with no calibration, because `bowed` fell back to `true`. It now falls back to `false`. Press C first to reach level 3.
3. The bow angle used a raw `abs(pitch - calib.pitch)`, which breaks across the +-180 wrap. It is now wrapped to +-180.
4. One thrown exception in `detectForVideo` or `analyze` silently stopped the rAF loop. The body is now in try/catch, which shows `error: ...` in the status line and logs it.

Checked and found correct, no change needed:
- Pose indices 0, 11, 12, 15, 16, 19, 20, 21, 22.
- Face indices 1 (nose tip) and 9 (between the brows).
- Hand indices 4, 8, 12.
- Model URLs.
- The sign of `fingersUp`, `tipNose`, and `thumbBrow` (y grows downward).
- The pitch formula `atan2(m[6], m[10])` on the column-major matrix.
- The mirrored canvas.

## What loads (verified, headless Chromium 1234 + fake camera, `--use-file-for-fake-video-capture`)
- `vision_bundle.mjs` and the wasm files from jsDelivr 1.1.0 return 200.
- `pose_landmarker_full.task`, `face_landmarker.task`, and `hand_landmarker.task` from storage.googleapis.com return 200.
- All three landmarkers are created with `delegate: 'GPU'` (WebGL via SwiftShader headless). The status goes to "พร้อม" and the render loop runs.
- Console output has no page errors and no failed requests. The only noise:
  - `Failed to load resource ... 404` (favicon.ico, from my local http.server).
  - `INFO: Created TensorFlow Lite XNNPACK delegate for CPU.` (logged as "error" type, harmless).
  - Warnings: `landmark_projection_calculator.cc:81 Using NORM_RECT without IMAGE_DIMENSIONS...`, `GPU stall due to ReadPixels`.
- Model load takes about 25 s on a cold cache. Headless software rendering gave about 2 fps (pose 165 ms, face 20 ms, hands 120-400 ms). That is not representative of a real GPU.
- Python mediapipe 1.1.0 also loads the same three .task files.

## Per-image results (Python Tasks API, IMAGE mode, default 0.5 confidence, heuristic re-implemented offline, bow not checked)
| Image | Pose | Face | Hand Landmarker | Approx. level |
|---|---|---|---|---|
| Thai_wai.jpg (statue, hands at chest) | yes | yes | 0 hands | Pose fallback: gap 0.30, center 0.02, fingersUp 0.15 (borderline), tipNose -1.1. Gives level 1 if `fingersUp` passes, else 0. In the browser the same still gave level 1 (fingersUp 0.16-0.19). Expected: 1. |
| Bowing_Thai_greeting.jpg (hands over nose, hair covers face) | none at 0.5. At 0.2 a garbage pose (wrists off-body) | none | 0 hands | 0. Detectors fail on the occluded, hair-covered face and the palms-together hands. Expected: 2 or 3. |
| Koh_Samui (statue plus man in profile) | 1 pose, on the man (the Ronald statue is not a person) | none | 1 hand (the man's) | 0 from the profile collapse (sw about 10 px). The new guard reports "face the camera". Even with a sane `sw`, it would be about 1 (hand below nose). It does not pick the statue. |

Key finding: with palms together, the Hand Landmarker found 0 hands in 2 of 3 stills, so the pose fallback (19/20/21/22) carries the logic in practice. Face detection is lost when the hands cover the face.

## Recommended thresholds (not yet tuned on a live person)
- `gapMax` 0.45 -> 0.55. The pose wrist spacing for a prayer pose measured 0.30-0.41 depending on resolution; 0.45 has little margin.
- `fingersUpMin` 0.15 -> 0.08. A real prayer pose measured 0.15-0.19 via the pose fallback; 0.15 is on the edge. Hanging arms are negative, so 0.08 still rejects them.
- `centerMax` 0.5, `tipNoseMin` -0.02, `thumbBrowMin` -0.05: keep. They only separated clearly different poses in the stills, so there is no basis to move them.
- `bowMinDeg` 12 and `neckDropMin` 0.08: keep as starting points. They could not be checked on stills.
- `holdMs` 700: keep. Hold time on the headless run was noisy because of 2 fps.
- I did not edit `TH`, so these are suggestions only.

## Not verified, needs a human with a webcam
- Real fps and latency on a GPU, and that GPU delegate creation works on the target Mac and Windows machines (this run used SwiftShader).
- The camera permission flow inside Electron (here the flag `--use-fake-ui-for-media-stream` auto-granted it).
- Level 2 versus level 3 separation with a real moving person: `tipNose`, `thumbBrow`, and the calibrated bow (press C first). Level 3 has not been seen firing even once.
- Face loss while the hands cover the face (the fallback uses pose nose and eye points).
- Several people in frame. The page uses `numPoses: 1`, so it may pick the wrong person.
- Pose wrist visibility threshold 0.5 when the hands are low or out of frame.
- Whether the face matrix pitch sign and range behave on a real head turned down.
- Different distances, lighting, and glasses.
