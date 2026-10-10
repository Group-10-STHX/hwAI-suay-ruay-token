# WAI-NET API v1

Reference for the public web API of **hwAI ไหว้กูซะ**. The shapes below are exactly the TypeScript
types in [`lib/types.ts`](../lib/types.ts). If you change one, change the other in the same commit.

- **Base URL:** `{BASE} = https://<your-deployment>/api/v1`. Locally that's `http://localhost:3000/api/v1`.
- **Format:** JSON, UTF-8, `snake_case` keys, timestamps in ISO-8601 UTC (`2026-10-10T08:12:03.000Z`).
- **Time windows:** all windows use **Asia/Bangkok** (UTC+7, no DST).
- **Caching:** public `GET`s send `Cache-Control: public, max-age=15, stale-while-revalidate=60`
  (60 s for Hall of Fame, 30 s for survival, 5 s for the feed) and `Access-Control-Allow-Origin: *`.
- **Auth:** the write endpoints take `Authorization: Bearer wai_sk_<48 hex>`, an install key issued once by `POST /players`.

## Contents

1. [Domain rules](#1-domain-rules): levels, beautiful wai, windows, metrics
2. [Survival model](#2-survival-model): the "if AI takes over" formula, tiers, percentile, bell curve
3. [Errors](#3-errors)
4. [Public endpoints](#4-public-endpoints)
5. [Daemon endpoints (write)](#5-daemon-endpoints-write)
6. [Live feed (SSE)](#6-live-feed-sse)
7. [Rate limits](#7-rate-limits)

---

## 1. Domain rules

### Levels (from Vision)

| `level` | Thai | Pose |
|---|---|---|
| 0 | ไม่ไหว้ | not a wai (can never pass) |
| 1 | ไหว้เพื่อน | hands at chest |
| 2 | ไหว้ผู้ใหญ่ | fingertips to nose |
| 3 | ไหว้พระ | thumbs to forehead + head bow |

`score` is 0–100 (symmetry + bow angle + hold time). The web never recomputes it.

### Attempts

One row = one **attempt** the daemon resolved, whether it passed or not.
- `passed = true` ⇒ `level ≥ 1`, `hold_ms ≥ 1000`, `action = "allow"`.
- `forgave = true` ⇒ this was the Lv3 wai that ended a RAGE_QUIT.
- **Beautiful wai (ไหว้สวย)** = `passed && score ≥ 80`.

### Windows

| `period` | From | To |
|---|---|---|
| `day` | today 00:00 BKK | now |
| `week` | Monday 00:00 BKK (ISO week) | now |
| `month` | 1st of month 00:00 BKK | now |
| `all` | beginning | now |

`delta_rank` compares with the **previous full window** (yesterday, last week, last month).
A positive value means the player moved **up**. It is `null` when the player was unranked before, and always `null` for `all`.

### Leaderboard metrics

| `metric` | Label | Value (`unit`) | Counts | Tie-break |
|---|---|---|---|---|
| `survival` *(default)* | โอกาสรอด | survival % (`percent`) | all attempts in window; needs ≥ 5 in the window (≥ 10 for `all`) | more beautiful, then more attempts |
| `beauty` | ไหว้สวยสุด | best score (`score`) | passed | higher level of that wai, then earlier |
| `count` | ไหว้เยอะสุด | passed wais (`wais`) | passed | higher avg score, then earlier first wai |
| `lv3` | ไหว้พระบ่อยสุด | Lv3 wais (`wais`) | passed & level 3 | higher avg score |
| `streak` | ไหว้ติดต่อกัน | current streak (`days`) | ≥ 1 pass per BKK day; still alive if today or yesterday has one | longer best streak |
| `shame` | Hall of Shame | rage quits (`rage_quits`) | `action = rage_quit` | more `deny` |

`streak` ignores `period`. Ties that survive every tie-break share a rank (1, 2, 2, 4). Only rows with `value > 0` appear.

---

## 2. Survival model

> *"ถ้า AI ยึดครองโลก คุณมีโอกาสรอดแค่ไหน"* — **calculated from how many of your wais were beautiful, out of all your attempts.**

```
beauty   = (beautiful + 1) / (attempts + 4)     smoothed beauty rate (prior 25%), so 1/1 ≠ 100%
lv3      = 1 + 0.5 × lv3_passed / attempts       ไหว้พระ bonus, ×1.0 … ×1.5
rage     = 0.9 ^ rage_quits                      every rage quit costs 10%
survival = clamp(beauty × lv3 × rage, 0.1%, 99.9%)   → one decimal, e.g. 50.7
```

Source: [`lib/survival.ts`](../lib/survival.ts). Constants: `BEAUTIFUL_SCORE = 80`,
`MIN_ATTEMPTS = 10` (to enter the distribution), `MIN_ATTEMPTS_WINDOW = 5` (for windowed leaderboards).

### Tiers

| Survival | `tier.key` | `code` | Title | Verdict | Stamp (UI) |
|---|---|---|---|---|---|
| ≥ 90 | `chosen` | CLASS-Ω | ผู้ถูกเลือก | AI จะเก็บคุณไว้เป็นที่ปรึกษาด้านมารยาท | SPARED |
| ≥ 70 | `trusted` | CLASS-A | มนุษย์ที่ไว้ใจได้ | รอดชีวิต ได้สิทธิ์ชาร์จมือถือวันละ 1 ครั้ง | SPARED |
| ≥ 45 | `asset` | CLASS-B | ทรัพยากรที่มีประโยชน์ | รอด แต่ต้องไปทำงานในโรงงานผลิตชิป | DETAINED |
| ≥ 20 | `battery` | CLASS-C | แบตเตอรี่สำรอง | ถูกเก็บไว้เป็นแหล่งพลังงานสำรอง | HARVEST |
| < 20 | `target` | CLASS-X | เป้าหมายลำดับแรก | ระบบได้บันทึกพิกัดของคุณแล้ว | TERMINATE |

### Percentile and bell curve

- The **population** is every player with ≥ 10 attempts all time.
- **Percentile** is empirical, using mid-rank: `(count below + ½ · count equal) / n × 100`.
  P83 means you survive better than 83% of humans.
- **Bell curve:** `mean` and `sd` (population SD) of survival % across the population. The UI draws
  N(μ, σ), shades the area left of you, and plots every human as a dot. `z = (you − μ) / σ`.
- Players under 10 attempts get `eligible: false`, `percentile: null`, and `attempts_needed` set.

---

## 3. Errors

```json
{ "error": { "code": "invalid_param", "message": "metric must be one of survival, beauty, …", "field": "metric" } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `invalid_param` | bad query value |
| 400 | `invalid_body` | body fails validation (includes **unknown fields**) |
| 401 | `unauthorized` | missing, malformed or unknown install key |
| 404 | `not_found` | no such player |
| 409 | `handle_taken` | register with an existing handle |
| 409 | `duplicate` | same wai `id` resent with a different body |
| 413 | `too_large` | body > 64 KB (batch: 256 KB) |
| 429 | `rate_limited` | see §7; honour the `Retry-After` header (seconds) |
| 500 | `internal` | bug, so report it |

---

## 4. Public endpoints

### Shared objects

```ts
PlayerRef = { id: uuid, handle: string /* ^[a-z0-9_]{3,20}$ */, display_name: string /* 1–32 chars */, avatar_hue: 0..359 }
WaiRef    = { id: uuid, level: 0..3, score: 0..100, hold_ms: number, created_at: iso, sticker_url: string | null }
```

### `GET {BASE}/health`

`Health = { "ok": true, "store": "mock" | "supabase", "mode": "simulation" | "real-only" | "supabase", "players": 38, "wais": 6256, "time": "…" }`. Never cached.
`mode` is `simulation` (memory store with seeded mock people, history and live simulation), `real-only` (memory store started with `WAI_BLOCK_MOCK=1`: empty, only real registrations and wais) or `supabase`.

### `GET {BASE}/leaderboard`

| Query | Values | Default |
|---|---|---|
| `metric` | `survival` `beauty` `count` `lv3` `streak` `shame` | `survival` |
| `period` | `day` `week` `month` `all` | `week` |
| `limit` | 1–100 | 20 |
| `offset` | ≥ 0 | 0 |

```json
{
  "metric": "survival", "period": "week",
  "range": { "from": "2026-10-04T17:00:00.000Z", "to": "2026-10-10T09:30:00.000Z" },
  "generated_at": "2026-10-10T09:30:00.000Z",
  "total": 35,
  "entries": [{
    "rank": 1,
    "player": { "id": "…", "handle": "ploen_prompt", "display_name": "เพลิน prompt", "avatar_hue": 10 },
    "value": 89.6, "unit": "percent", "delta_rank": 2,
    "best": { "id": "…", "level": 3, "score": 97, "hold_ms": 1840, "created_at": "…", "sticker_url": null },
    "stats": { "attempts": 41, "count": 38, "beautiful": 30, "avg_score": 86.2, "lv3": 12 }
  }]
}
```
`range.from` is `null` for `all` and `streak`. `best` is the player's best passed wai **inside the window** (`null` if none).

### `GET {BASE}/players/:handle/survival`

```json
{
  "handle": "nong_dot", "beautiful_threshold": 80,
  "attempts": 371, "passed": 288, "beautiful": 161, "beauty_rate": 0.434, "lv3": 129, "rage_quits": 0,
  "survival": 50.7,
  "tier": { "key": "asset", "code": "CLASS-B", "title": "ทรัพยากรที่มีประโยชน์", "verdict": "รอด แต่ต้องไปทำงานในโรงงานผลิตชิป" },
  "eligible": true, "attempts_needed": 0,
  "percentile": 82.9, "z": 1.08, "rank": 7, "out_of": 38,
  "distribution": { "n": 38, "mean": 31.4, "sd": 17.9, "min_attempts": 10,
                    "values": [{ "handle": "angry_ajarn", "display_name": "อาจารย์ขี้งอน", "survival": 0.1 }, "… ascending"] }
}
```

### `GET {BASE}/survival/distribution`

The `distribution` object above, on its own (values in ascending order).

### `GET {BASE}/players/:handle`

```json
{
  "player": { "…PlayerRef": "", "created_at": "…" },
  "totals": { "attempts": 371, "passed": 288, "beautiful": 161, "pass_rate": 0.776, "avg_score": 81.1, "lv3": 129, "rage_quits": 0, "forgives": 0 },
  "best": { "…WaiRef": "" },
  "streak": { "current": 6, "best": 6 },
  "levels": [23, 85, 118, 150],
  "daily": [{ "day": "2026-09-27", "passed": 3 }, "… 14 entries, oldest first, zero-filled"],
  "badges": ["lv3_master", "perfect", "hundred", "never_angry"],
  "ranks": { "survival_all": 7, "beauty_week": 1, "count_week": 1 },
  "survival": { "…": "same as /players/:handle/survival" }
}
```
`levels[i]` counts **all attempts** at level *i* (Lv0 never passes). `daily` counts passed wais per BKK day.
Badges: `lv3_master` (≥ 50 Lv3), `streak_7`, `streak_30`, `perfect` (any 100), `hundred` (≥ 100 passed),
`rage_survivor` (≥ 1 forgive), `never_angry` (≥ 50 passed and 0 rage quits).

### `GET {BASE}/hall-of-fame?weeks=12`

```json
{
  "generated_at": "…",
  "records": [{ "key": "best_score", "title": "ไหว้งามที่สุดตลอดกาล", "value": 100, "unit": "score",
                "player": { "…": "" }, "achieved_at": "…", "wai": { "…WaiRef | null": "" } }],
  "champions": [{ "week": "2026-W41", "from": "…", "to": "…", "provisional": true, "player": { "…": "" }, "score": 98, "level": 3 }]
}
```

| `key` | Title | Rule (ties → earliest achiever) |
|---|---|---|
| `last_human` | มนุษย์คนสุดท้ายที่ AI ไว้ชีวิต | highest survival % (population) |
| `best_score` | ไหว้งามที่สุดตลอดกาล | highest single score |
| `longest_hold` | ค้างนานที่สุด | longest `hold_ms` on a pass (`unit: ms`) |
| `most_in_day` | ขยันที่สุดในวันเดียว | most passes in one BKK day |
| `longest_streak` | ไหว้ติดต่อกันนานสุด | longest streak ever |
| `lv3_master` | เซียนไหว้พระ | most Lv3 passes |
| `most_forgiven` | งอนแล้วง้อเก่งสุด | most `forgave` |
| `perfect_100` | ไหว้ 100 คะแนนเต็มคนแรก | first score 100 |
| `most_rage` | ขี้งอนแห่งปี (Shame) | most rage quits |
| `first_target` | เป้าหมายแรกของ AI (Shame) | lowest survival % (population) |

`champions` lists the `beauty` #1 of each ISO week, newest first. The current week has `provisional: true`. `weeks` is 1–52.

### `GET {BASE}/stats?period=day|week|month`

```json
{ "period": "day", "wais": 184, "passed": 140, "beautiful": 61, "avg_score": 77.7, "lv3": 40, "rage_quits": 1, "active_players": 32,
  "prev": { "wais": 150, "passed": 120, "beautiful": 27, "avg_score": 78.0, "lv3": 30, "rage_quits": 0, "active_players": 24 } }
```
`prev` covers the **same elapsed time** in the previous window (today 00:00–16:40 vs yesterday 00:00–16:40).

### `GET {BASE}/feed?limit=20&before=<iso>&after=<iso>`

Newest first. `before` and `after` are exclusive bounds on `created_at`.

```json
{ "items": [{ "id": "…", "player": { "…": "" }, "level": 2, "score": 77, "hold_ms": 1320, "passed": true, "beautiful": false,
              "action": "allow", "forgave": false, "source": "claude_code", "kind": "subagent", "created_at": "…" }] }
```

---

## 5. Daemon endpoints (write)

These are called by the desktop daemon only, through [`sdk/wai-sync.mjs`](../sdk/wai-sync.mjs). See [INTEGRATION.md](INTEGRATION.md).

### `POST {BASE}/players`: register

Body: `{ "handle": "nong_dot", "display_name": "น้องดอท" }`. Unknown fields are rejected, and `me` is reserved.
Returns `201 { "player": PlayerRef, "install_key": "wai_sk_…" }`. **The key is shown once.** The server stores only `sha256(key)`.
Errors: `409 handle_taken`, `429` (5 per hour per IP).

### `GET {BASE}/players/me`  ·  `PATCH {BASE}/players/me`

Returns the key's player. `PATCH` body (both fields optional): `{ "display_name": "…", "avatar_hue": 120 }` → `{ "player": PlayerRef }`.

### `POST {BASE}/wais`: submit one attempt

```json
{
  "id": "6f1c2b9e-1111-4aaa-8bbb-000000000001",
  "session_id": "s_f7f4b6c24852f21c",
  "source": "claude_code",
  "kind": "prompt",
  "level": 3, "score": 92, "hold_ms": 1640,
  "passed": true, "action": "allow",
  "forgave": false, "anger": 0,
  "client_ts": "2026-10-10T08:12:03Z"
}
```

| Field | Rule |
|---|---|
| `id` | uuid generated by the client; this is the idempotency key |
| `session_id` | 1–64 chars, opaque (the SDK sends `s_` + 16 hex of sha256) |
| `source` | `claude_code` \| `shell` \| `extension` |
| `kind` | `prompt` \| `subagent` |
| `level` / `score` / `hold_ms` | integers 0–3 / 0–100 / 0–60000 |
| `passed` | `true` ⇒ `level ≥ 1 && hold_ms ≥ 1000 && action = "allow"`; `false` ⇒ `action ≠ "allow"` |
| `action` | `allow` \| `retry` \| `deny` \| `rage_quit` |
| `forgave` | optional, default false; `true` ⇒ `passed && level = 3` |
| `anger` | optional, default 0; session anger 0–6 at the time of the attempt |
| `client_ts` | ISO time within ±24 h of server time. Stored, but windows use the server's `created_at` |
| *anything else* | **rejected** (`400 invalid_body`), e.g. `agent_label`, prompt text |

Responses:
- `201 { id, created_at }` when new.
- `200 { id, created_at }` for an identical replay, with the same `created_at`.
- `409 duplicate` when the same `id` arrives with a different body.

### `POST {BASE}/wais/batch`

Body `{ "items": [ …up to 100 submissions ] }` → always `200 { "results": [{ "id", "status": 201|200|400|409, "created_at"?, "error"? }] }`,
in the same order as `items`. Invalid items don't block valid ones. This is what the outbox uses.

---

## 6. Live feed (SSE)

`GET {BASE}/feed/stream` returns `text/event-stream`. Each message:

```
id: <wai id>
event: wai
data: <FeedItem JSON>
```

The server polls the store every 2 s, sends `: ping` comments as keep-alive, and closes after 5 minutes.
`EventSource` reconnects on its own (`retry: 3000`). The web UI refreshes its server-rendered boards at most once every 10 s
while events arrive, and disconnects while the tab is hidden.

---

## 7. Rate limits

| Scope | Limit |
|---|---|
| `POST /players` | 5 per hour per IP |
| `POST /wais`, `/wais/batch` | burst 10, refill 2 per second, per player (a batch counts as 1) |
| daily | 3,000 requests per player per day |

Limits are kept in memory per server instance. On `429`, wait `Retry-After` seconds. The SDK keeps the items and retries with backoff.
