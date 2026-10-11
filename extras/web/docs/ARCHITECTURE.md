# Architecture

```
extras/web/
├── app/                      Next.js App Router (server components by default)
│   ├── page.tsx              home: hero + countdown + scan form, tiles, leaderboard, live feed, Hall of Fame
│   ├── players/page.tsx      /players?handle=… → redirect (scan form target)
│   ├── players/[handle]/     dossier: survival %, tier stamp, formula, bell curve, stats, charts
│   ├── tv/page.tsx           booth screen: rotating boards + feed
│   ├── api/v1/**/route.ts    public API (docs/API.md)
│   ├── layout.tsx            fonts, CRT overlay, ticker, header, boot-skip script
│   ├── globals.css           the default HUD theme (tokens at :root)
│   └── themes/               preview themes: base.css (scaffolding, hidden extras) · arcade.css · book.css · news.css
├── components/               Board, StatTiles, HallOfFame, bits, ThemeBits (server) · LiveFeed, BellCurve, Countdown, BootSequence, TvRotator (client; plus StickerWall, TvSticker)
├── lib/
│   ├── types.ts              API types: the contract
│   ├── engine.ts             pure computation over a Snapshot (all rankings, survival, HoF, stats, feed)
│   ├── survival.ts           survival formula, tiers, percentile
│   ├── time.ts               Asia/Bangkok windows
│   ├── validate.ts           strict write validation
│   ├── http.ts, errors.ts, ratelimit.ts   (http.ts: readBytes streams a capped raw body)
│   ├── image.ts              PNG/JPEG/WebP magic bytes + dimension checks
│   ├── cartoon.ts            SVG faces for SIMULATED players only
│   ├── service.ts            current() = store + snapshot + now
│   └── store/                memory.ts (mock + simulation) · supabase.ts · index.ts (WAI_DATA switch)
├── sdk/wai-sync.mjs          daemon uploader incl. stickers/avatar (docs/INTEGRATION.md); wai-sync.test.mjs = node --test
├── scripts/smoke.mjs         end-to-end API checks
└── supabase/migrations/      schema
```

## One engine, two stores

`Store.snapshot()` returns every player and wai in time order. `lib/engine.ts` computes all responses from that
snapshot. Pages call the engine **directly** (no HTTP hop during SSR), and route handlers call the same functions,
so the HTML and the API can never disagree.

- **Memory store** (`WAI_DATA=mock`, the default): 63 days of seeded history plus a simulation that "catches up" on
  each read (one attempt every 2–5 s of wall time, no timers). Real writes are accepted, which makes `npm run dev`
  a full local backend. Data lives in process memory and resets on restart. With `WAI_BLOCK_MOCK=1` the same store
  starts empty (no seed, no simulation): only real registrations and wais, so mock and real data never mix.
  `/health` reports `mode`: `simulation`, `real-only` or `supabase`.
- **Supabase store** (`WAI_DATA=supabase`): loads all rows in pages of 1,000 and caches the snapshot for 10 s,
  deduplicating concurrent loads. Writes invalidate the cache.

Engine results are memoised per snapshot `version`. The memory store bumps it on every insert, and Supabase creates a new snapshot on each reload.

## Rendering and live updates

- Leaderboard tabs are plain `<Link>`s with `?metric=&period=`. They render on the server, ship no client JS, and can be shared as URLs.
- `LiveFeed` opens `EventSource('/api/v1/feed/stream')`, prepends items, and calls `router.refresh()` at most once
  every 10 s, which re-renders the boards on the server. It disconnects while the tab is hidden.
- `BellCurve` is a client component (hover crosshair and tooltips). It measures its container so the SVG text
  stays 11–13 px on phones.
- The boot screen shows once per tab session. A `<head>` script sets `data-skip-boot` before first paint for repeat
  visits, reduced motion and `/tv`, so there is no flash.

## Theme

Dark only (machine-uprising HUD). Fonts are Chakra Petch (Thai + Latin) and Share Tech Mono through `next/font`,
self-hosted at build time. The effects (scanlines, sweep, glitch, rotating reticles, ticker) animate only `transform` and `opacity`, and every animation stops under `prefers-reduced-motion`.
The Lv0–Lv3 chart ramp (`--lv0..3`) is a single-hue ordinal ramp validated against the panel surface `#120404`.

### Preview themes (design directions, pick one)

Three alternative looks over the same data, switched at runtime. Default (no theme) is the HUD above, unchanged.

| `?theme=` | Direction | Notes |
|---|---|---|
| `arcade` | fighting-game character select: sticker portraits in skewed cards, KO-counter ranks, scanlines, live-feed marquee | dark; Kanit italic |
| `book` | sticker album on dark cork: die-cut stickers at slight rotations, washi-tape rank labels, holographic foil top 3, sticky-note tiles, taped polaroid records | dark; Mali |
| `news` | Thai tabloid front page: masthead + dateline, ข่าวด่วน crawl, giant headline with highlighter, halftone "ภาพข่าวประจำวัน", Hall of Fame as a front page with generated headlines | **light** (tokens re-validated for AA on paper; `--amber` is a dark ochre, `--hi` the highlighter); Kanit + Trirong |

- **Switch:** add `?theme=arcade|book|news` to any URL (any other value, e.g. `?theme=hud`, resets). A pre-paint `<head>`
  script (`THEME_INIT` in `app/layout.tsx`) sets `<html data-theme>` and remembers the choice in localStorage and a
  `wai-theme` cookie, so there is no flash and `/tv` keeps it. The footer has a small picker (plain `<a>`s that reload).
- **Scoping:** every rule in `app/themes/<name>.css` is under `[data-theme="<name>"]`. Themes mostly re-scope tokens and
  restyle existing classes. Server-rendered extras that only themes show (hidden by `themes/base.css` in the default
  look, and their lazy images are never fetched): `ThemeStrip` (dateline + live-feed marquee, `/` and `/tv`),
  `HeroSticker` (today's best sticker), `.pod-art` (full-body sticker on the podium, `Board`), `.rec-head` (tabloid
  headline, `HallOfFame`). No new client components, no API changes, no new npm dependencies.
- **Fonts:** Kanit, Mali and Trirong load through `next/font` with `preload: false`, so the default look never downloads them.
- **Motion:** foil swirl, card shine and marquee animate transform only and stop under `prefers-reduced-motion`.
- **Picking one:** keep its CSS file (fold its tokens into `globals.css` if it becomes the default), delete the other two
  plus their `@import`s in `layout.tsx`, and remove the footer picker. Choosing `news` also means updating invariant 8
  in `CLAUDE.md` (it is light, not dark). Screenshots: `docs/variants/`.

## Scaling

Snapshot-in-memory is fine up to roughly 100k wais. Past that:
1. Move `leaderboard` and `stats` into SQL (window functions over `wais` filtered by `created_at`) and keep the engine only for the snapshot-wide parts.
2. Or keep the engine and materialise daily per-player aggregates (`player_days`), so windows sum over at most ~31 rows per player.

## Deploying

- **Single Node host** (`npm run build && npm start`): everything works, including SSE and the in-memory rate limits.
- **Serverless (e.g. Vercel):** use `WAI_DATA=supabase`. The memory store and rate limits are per instance, and SSE
  connections are capped by the platform's function duration. `EventSource` reconnects, so the feed still works.
- Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` server-side only. Apply `supabase/migrations/0001_init.sql` first.
