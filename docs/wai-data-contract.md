# Wai data contract (merge: hook + vision + web)

Agreed 2026-10-10. Every part below must follow this file. Change it here first, then the code.

Decisions from the team:

- token = `level × 10 + 20` when the wai is beautiful (`score >= 80`); 0 when not passed
- tokens and awards stay **local only**. The web API does not change; the web counts "beautiful" itself from `score`
- Block Mock Data = server env `WAI_BLOCK_MOCK=1` plus a visible mode badge on the web
- the anger state machine ships in this round

## 1. Vision worker → main (IPC)

Existing: `vision:event` (VisionEvent ~15 fps, `app/renderer/src/api/types.ts`), `vision:control` from main `{run, requiredLevel}`.

`vision:pass`: once per wai, when the stable level ≥ `requiredLevel`, hold ≥ 1000 ms and score passes:

```js
{ level, score, holdMs, parts: { sym, cen, hold, bow }, attempts, style }
// parts: 0..1 each, bow is degrees or null; attempts = failed attempts since the camera started
// style: 'normal' | 'weird' (weird = passed but clearly off-norm, e.g. very asymmetric)
```

`vision:fail`: when an attempt ends without a pass. An attempt starts when the stable level becomes > 0 and ends when it returns to 0.
Only attempts that reached a stable level > 0 for at least 300 ms count (filters flicker).

```js
{ level, score, holdMs, reasons, parts }   // peak level, peak score, longest hold, last reasons
```

## 2. Local record: `~/.waikusa/wais.jsonl`

One JSON line per resolved real attempt (pass or fail). Never for: skip (dev button), bypass, expiry, disabled app.

```js
{
  v: 1, id, at,                         // uuid, ISO time
  session_id, source, kind, agent_label, // from the queue item (agent_label stays local)
  passed, action,                        // action: 'allow' | 'retry' | 'deny' | 'rage_quit'
  level, score, hold_ms, parts, attempts, style,
  state, anger, forgave,                 // session state machine at resolution (§4)
  awards,                                // ['beautiful' if passed && score>=80, 'monk' if passed && level===3, 'weird' if passed && style==='weird']
  tokens                                 // passed ? level*10 + (score>=80 ? 20 : 0) : 0
}
```

## 3. `spikes/popup-hook/wai-log.mjs`

```js
export const BEAUTIFUL_SCORE = 80
export function tokensFor({ passed, level, score })  // number
export function awardsFor({ passed, level, score, style })  // string[]
export function createWaiLog({ home, sync = true, now = () => new Date() }) => {
  record(attempt),  // sync, never throws; appends to <home>/wais.jsonl and (if sync) calls wai-sync record()
  stats(),          // { today: {wais, passed, beautiful, tokens}, total: {wais, passed, beautiful, tokens}, best_score }
  flush(),          // Promise, flushes wai-sync
  stop(),
}
```

- `home` is `~/.waikusa` (the daemon's folder). wai-sync is created with `createWaiSync({ home })`, so its config is the `web` key in `~/.waikusa/config.json`.
- Only contract fields go to the web (wai-sync `toSubmission` already strips the rest). Never send `agent_label`, prompt text, tokens or awards.
- `stats()` reads the jsonl once at start, then keeps counters in memory. "today" uses the Asia/Bangkok date.

## 4. Session state machine: `spikes/popup-hook/session-state.mjs`

Per `session_id`, following `app/renderer/FRONT_RULES.md` §4.

| fails | state | required level | daemon behaviour |
|---|---|---|---|
| 0 | DEMANDING → WATCHING → PASSED | 1 | normal |
| 1–2 | RETRY | 1 | normal |
| 3–4 | ANNOYED | 2 | normal |
| 5 | SULKING | 2 | requests of this session wait; a pass at level ≥ 2 brings it back |
| 6 | RAGE_QUIT | – | the waiting request resolves `{passed:false, action:'rage_quit'}`; the hook prints "AI งอนแล้ว ไปขอขมาซะ" and blocks |
| after rage quit | FORGIVE | 3 | next request of the session needs level 3; that pass sets `forgave:true` and resets fails to 0 |

- `anger = min(fails, 6)`. A pass resets fails to 0 (except it must meet the required level).
- A fail is a `vision:fail` while the session's request is the top of the queue.
- **Safety: never move, rename or delete any Claude Code / Codex session file or folder.** RAGE_QUIT only resolves the request.
- `/wai/queue` returns the top session's real `state` and `fail_count`; main sends the state's required level in `vision:control`.

## 5. `/wai/status`

```js
{ enabled, pending, last_seen,
  stats: { requests, passed, bypassed,                       // existing
           today: { wais, passed, beautiful, tokens },        // new, from wai-log
           total: { wais, passed, beautiful, tokens },
           best_score } }
```

`app/renderer` widens `AppStatus.stats` to match and the home window shows today's wais, beautiful wais and tokens.

## 6. Web: Block Mock Data

- `WAI_BLOCK_MOCK=1` with `WAI_DATA` not `supabase`: the memory store starts empty (no seeded people, no history, no live simulation) and still accepts real writes.
- `/health` reports the mode (`simulation` | `real-only` | `supabase`); the layout badge shows REAL ONLY.
- `lib/types.ts` and `docs/API.md` change together (web CLAUDE.md invariant 1).
