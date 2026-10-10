# extras/web: WAI-NET (hwAI ไหว้กูซะ leaderboard)

Next.js 16 app (owner: **#6 Extras & Ship**) that serves the public leaderboard, the Hall of Fame, the
"survive the AI takeover" odds with a bell-curve percentile, and the **public API** the desktop daemon uploads to.
Project-wide plan and contract: `/artifact.md` (root). If that contract and this folder disagree, the root wins:
fix the docs here first, then tell the group.

> The leaderboard is the **first thing cut** if time runs short (artifact.md · ตัด scope). Nothing here may block or slow
> the core loop (hook → popup → ไหว้ → pass). The daemon uploads fire-and-forget through `sdk/wai-sync.mjs`.

## Commands

```bash
npm install
npm run dev          # http://localhost:3000 (mock data + live simulation; accepts real writes)
npm run build        # production build; must pass with zero type errors
npm start            # serve the build
npm run typecheck
npm run smoke        # 24 end-to-end API checks against http://localhost:3000/api/v1 (or pass a base URL)
```

`WAI_DATA=supabase` plus `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` switch to the real database (`.env.example`,
schema in `supabase/migrations/0001_init.sql`).

## Docs (read the one you need)

| File | For |
|---|---|
| [docs/API.md](docs/API.md) | every endpoint, shape, error, rate limit, plus the **survival model** and tiers |
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | wiring the daemon (`/app/main`) to upload attempts, with a test checklist |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | folder map, engine/store design, live updates, theme, scaling, deploy |

## Invariants: don't break these

1. **`lib/types.ts` is the contract.** `docs/API.md` documents exactly these shapes. Change both in the same commit.
2. **One engine.** All numbers come from `lib/engine.ts` over a `Snapshot`. Pages call it directly through
   `lib/service.ts` `current()`, and API routes call the same functions. Never compute rankings anywhere else, and
   never `fetch` your own API from a server component.
3. **Stores only load and save rows** (`lib/store/*`). Mock and Supabase must behave identically: idempotent
   inserts (201/200/409), `created_at` set by the server, rows in time order.
4. **Writes are strict.** `lib/validate.ts` rejects unknown fields so `agent_label`, prompt text and paths can never land.
   Keep it that way.
5. **Time is Asia/Bangkok.** Use `lib/time.ts` (`startOf`, `bkkDay`) and never `new Date().getDate()`.
6. **Survival formula** lives only in `lib/survival.ts`. If you change it, update docs/API.md §2 and the formula shown
   on `app/players/[handle]/page.tsx`.
7. **Server components by default.** Client components are only `LiveFeed`, `BellCurve`, `Countdown`,
   `BootSequence` and `TvRotator`. Tabs are `<Link>`s (URL state), not client state.
8. **Theme tokens live in `app/globals.css` `:root`.** The theme is dark only. Animate only transform/opacity, and
   everything must stop under `prefers-reduced-motion`. Chart colours: `--lv0..3` is a validated ordinal ramp, and
   text never wears a series colour.
9. **No horizontal scroll at 390 px.** Check mobile after any layout change.

## Common tasks

- **Add a leaderboard metric:** add it to `Metric`/`METRICS` (types.ts) → `UNIT` and `comparator()` (engine.ts) →
  `METRIC_LABEL` (format.ts) → docs/API.md §1 table → `npm run smoke` (the metric loop picks it up if you add it there).
- **Add a Hall of Fame record:** `hallOfFame()` in engine.ts → `RECORD_ICON` (format.ts, and `SHAME_RECORDS` if
  it's a shame record) → docs/API.md table.
- **Change the mock world:** `lib/store/memory.ts` (players, skills, anger state machine). Keep `monk_mode` near
  the top and `angry_ajarn` at the bottom; the demo relies on them.

## Verify before you say "done"

1. `npm run build` passes.
2. `npm start` and `npm run smoke -- http://localhost:3000/api/v1` → `all checks passed`.
3. Open `/`, `/players/nong_dot`, `/tv` at desktop and 390 px wide: no console errors, no horizontal scroll, and the
   live feed shows `UPLINK ACTIVE`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
