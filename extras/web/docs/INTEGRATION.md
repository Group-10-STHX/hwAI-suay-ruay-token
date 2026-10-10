# Integration guide: daemon → WAI-NET web

**Audience:** a Claude agent (or teammate) working in the **desktop daemon** (`/app/main`, owner #1) who
needs every resolved wai to show up on the web leaderboard. Optional extras for the overlay UI (`/app/renderer`, #2)
are in step 5. Read the whole file before editing anything. It is short on purpose.

## 0. What you are building

```
hook / shell / extension ──POST /wai/request──▶ daemon :7777 ──▶ popup + camera ──▶ vision {isWai, level, score, holdMs}
                                                  │
                                    resolves GET /wai/wait/:id → {passed, level, score, action}
                                                  │
                                    sync.record({...})   ← the only line you add on the hot path
                                                  │  (sync, never throws, writes ~/.wai/outbox.jsonl)
                                                  ▼
                                   background flush ──POST /api/v1/wais/batch──▶ WAI-NET web (Next.js)
```

There is one integration point: **when the daemon decides the `action` for an attempt, call `sync.record(attempt)`.**
Everything else (queueing, retries, auth, privacy filtering) lives in [`sdk/wai-sync.mjs`](../sdk/wai-sync.mjs).

## Status & known gaps (as of 2026-10-10)

| Area | State |
|---|---|
| Web app, API, upload SDK, docs | Done. `npm run build` passes and `npm run smoke` passes 24/24 against the mock store |
| SDK end to end | Tested against the mock server: register, upload, offline outbox, 429 retry, `WAI_BYPASS` |
| Supabase store | **Not run against a real database yet.** It compiles only. Apply `supabase/migrations/0001_init.sql`, set `WAI_DATA=supabase`, then run `npm run smoke` |
| Deployment | **No public URL yet.** The booth `base_url` is still to be decided |
| Daemon (`/app/main`) | **Doesn't exist yet.** §4 describes the integration point by contract, not by file |
| Root contract | **Not yet in the root `CLAUDE.md`.** Per team rule, add the daemon → web upload there and get #1's agreement |
| Stickers | **Not in v1.** `sticker_url` is always `null` and there is no upload endpoint |

## 1. Ground rules (non-negotiable)

1. **Never block or slow the hook path.** `record()` is synchronous and returns in microseconds. Never `await` the network
   before answering `GET /wai/wait/:id`.
2. **Opt-in only.** Nothing is uploaded unless `~/.wai/config.json` has `web.enabled: true` and an `install_key`.
3. **Never upload with `WAI_BYPASS=1`.** The SDK checks this itself, so don't work around it.
4. **No private data.** Don't send prompt text, `agent_label`, file paths or raw session ids. The SDK whitelists fields
   and hashes `session_id`, and the server rejects unknown fields with `400`.
5. **Record every resolved attempt**, passed or failed. Failed attempts feed the survival odds and Hall of Shame.
   Don't record attempts that were abandoned before vision produced a result.
6. **Don't edit `/extras/web`** from the daemon side. If the SDK or API needs to change, tell #6 and update
   `docs/API.md` first (team rule: spec first, then tell the group).

## 2. Run the web locally (2 minutes)

```bash
cd extras/web
npm install
npm run dev                         # http://localhost:3000, mock data + live simulation, accepts real writes
npm run smoke                       # 24 API checks against http://localhost:3000/api/v1 → "all checks passed"
```

Mock mode is a complete backend: anything you POST appears on the leaderboard immediately. Data resets when the dev server restarts.

## 3. Register a test player

Use a throwaway `WAI_HOME` so you don't touch your real `~/.wai`:

```bash
export WAI_HOME=/tmp/wai-dev
node extras/web/sdk/wai-sync.mjs register dev_yourname "ชื่อที่แสดง" --base http://localhost:3000/api/v1
node extras/web/sdk/wai-sync.mjs demo      # queues + uploads one fake attempt → { "sent": 1, "kept": 0 }
node extras/web/sdk/wai-sync.mjs status    # enabled, queued, lastError
open http://localhost:3000/players/dev_yourname
```

After 10 attempts the player page shows a percentile on the bell curve.

## 4. Wire it into the daemon (`/app/main`)

### 4.1 Create the sync once at startup

```js
// app/main/web-sync.js (or .ts)
import { createWaiSync } from '../../extras/web/sdk/wai-sync.mjs';

export const webSync = createWaiSync({
  // all optional:
  // home: process.env.WAI_HOME,          // default ~/.wai
  // logger: { warn: (...m) => log.warn('[web]', ...m) },
});
app.on('before-quit', () => webSync.flush());   // best effort; leftovers upload on next launch
```

The module is plain ESM with zero dependencies and needs Node ≥ 18 (global `fetch`). If the daemon is CommonJS, use
`const { createWaiSync } = await import('../../extras/web/sdk/wai-sync.mjs')`.

### 4.2 Call `record()` where an attempt resolves

Find the place where the daemon turns a vision event plus the session's anger state into the `action` returned by
`GET /wai/wait/:id`. Right after it computes that result, **before or after replying, but without awaiting anything**:

```js
webSync.record({
  session_id: req.session_id,        // from POST /wai/request; the SDK hashes it
  source: req.source,                // 'claude_code' | 'shell' | 'extension' (aliases OK, see table)
  kind: req.kind,                    // 'prompt' | 'subagent'
  passed: result.passed,
  level: result.level,               // 0–3 from vision
  score: result.score,               // 0–100 from vision
  hold_ms: vision.holdMs,            // how long the pose was held
  action: result.action,             // 'allow' | 'retry' | 'deny' | 'rage_quit'
  anger: session.anger,              // 0–6, the counter at the time of this attempt
  forgave: wasRageQuit && result.passed && result.level === 3,
});
```

### 4.3 Field mapping

| Daemon value | `record()` field | Notes |
|---|---|---|
| `POST /wai/request` `.session_id` | `session_id` | hashed to `s_<16 hex>` by the SDK |
| `POST /wai/request` `.source` | `source` | `hook`, `claude-code` → `claude_code`; `claude`, `codex`, `gemini`, `wrapper` → `shell`; `browser`, `chatgpt`, `claude.ai` → `extension` |
| `POST /wai/request` `.kind` | `kind` | anything except `subagent` becomes `prompt` |
| `POST /wai/request` `.agent_label` | — | **do not pass**; it is dropped anyway |
| wait result `.passed / .level / .score / .action` | same names | |
| vision event `.holdMs` | `hold_ms` (or `holdMs`) | a pass needs ≥ 1000, matching the daemon's ≥ 1 s rule |
| session anger counter | `anger` | count **after** this attempt on a failure (1–6), the value **before** reset on a pass |
| FORGIVE transition | `forgave: true` | only on the passing Lv3 wai that leaves RAGE_QUIT |

These must hold, or the server rejects the attempt (the SDK logs and drops it):
`passed ⇒ level ≥ 1, hold_ms ≥ 1000, action "allow"` · `!passed ⇒ action ≠ "allow"` · `forgave ⇒ passed && level 3`.
The SDK forces `action` to `allow` when `passed` is true and defaults a failed attempt with no valid action to `retry`.

### 4.4 What the SDK does for you

- Appends to `~/.wai/outbox.jsonl` (keeps at most 5,000 lines) and flushes 250 ms later in batches of 100 (`POST /wais/batch`).
- Retries on network errors, 429 and 5xx with backoff from 1 s up to 60 s. Leftovers are retried on the next launch.
- Drops items the server rejects (400/409) and logs them through `logger.warn`.
- Idempotent: every item has a uuid, so a retry after a timeout never double-counts.
- `status()` returns `{ enabled, bypass, base_url, handle, queued, lastError, lastFlushAt }`. Good for a settings screen or a debug log.

## 5. Optional: settings UI (#2, `/app/renderer`)

Expose these through IPC from the main process:

| UI | Call |
|---|---|
| "แสดงบน Leaderboard" toggle | `writeWebConfig({ enabled })` (exported by the SDK) |
| Register handle | `webSync.register(handle, displayName, baseUrl)` → stores `install_key`, sets `enabled: true` |
| Status line | `webSync.status()` |
| "ดูโอกาสรอดของฉัน" link | open `${site}/players/${handle}` |

Handle rules are `^[a-z0-9_]{3,20}$` with `me` reserved. Display names are 1–32 characters and Thai is fine.
On `409 handle_taken`, ask for another handle.

## 6. Configuration file

`~/.wai/config.json` (created by `register`, mode 0600):

```json
{ "web": { "enabled": true, "base_url": "http://localhost:3000/api/v1", "handle": "dev_yourname", "install_key": "wai_sk_…" } }
```

Other top-level keys belong to the daemon and are preserved. For the demo booth, point `base_url` at the deployed site.

## 7. Test checklist (run all before opening the PR)

| # | Do | Expect |
|---|---|---|
| 1 | `npm run smoke` in `extras/web` with the dev server up | `all checks passed` |
| 2 | Real flow: hook → popup → wai passes | a new row with your handle at the top of "ไหว้สด" within ~2 s |
| 3 | Fail 3 times, then pass | 3× `ไม่สวย` then `ผ่าน` in the feed; `/players/<you>` attempts +4 |
| 4 | Stop the web server, make 3 attempts, start it again | `status().queued` = 3 while it's down, then 0; all 3 show up once |
| 5 | `WAI_BYPASS=1` run | nothing uploaded, `record()` returns `false` |
| 6 | `web.enabled: false` | nothing uploaded, no outbox writes |
| 7 | Time the hook with the web server down | no added latency on `GET /wai/wait/:id` |
| 8 | `grep -c agent_label ~/.wai/outbox.jsonl` | `0` |

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `lastError: "401 unauthorized"` | key unknown to this server. A mock dev server forgets players on restart, so register again |
| `lastError: "HTTP 429"` | burst limit (10, refill 2/s). The SDK retries, so wait |
| warn `rejected … passed requires level ≥ 1…` | the daemon recorded a pass with a hold under 1 s or Lv0. Fix the daemon's pass rule |
| warn `rejected … unknown field` | you called the HTTP API directly with extra keys. Use `record()` |
| nothing in feed, `queued` growing | wrong `base_url` (must end in `/api/v1`) or server down |
| `enabled: false` after register | `WAI_HOME` points somewhere else in the daemon process |

## 9. Without the SDK (other languages)

```bash
KEY=$(curl -s -XPOST $BASE/players -H 'content-type: application/json' \
  -d '{"handle":"dev_x","display_name":"X"}' | jq -r .install_key)

curl -s -XPOST $BASE/wais -H "authorization: Bearer $KEY" -H 'content-type: application/json' -d '{
  "id":"'"$(uuidgen | tr A-Z a-z)"'","session_id":"s_0123456789abcdef","source":"shell","kind":"prompt",
  "level":2,"score":84,"hold_ms":1400,"passed":true,"action":"allow","anger":0,
  "client_ts":"'"$(date -u +%FT%TZ)"'"}'
```

Full contract: [API.md](API.md) §5.

## 10. Done when

- [ ] `record()` is called for every resolved attempt, and only there
- [ ] Hook latency is unchanged with the web server down
- [ ] Checklist §7 passes
- [ ] No changes under `/extras/web` (or they were agreed with #6 and `docs/API.md` was updated first)
