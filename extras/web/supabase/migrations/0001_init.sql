-- WAI-NET schema. Apply with the Supabase SQL editor or `supabase db push`.
-- All reads and writes go through the Next.js API with the service-role key, so RLS is enabled
-- with NO policies: the anon key can read nothing (install_key_hash stays private).

create extension if not exists pgcrypto;

create table if not exists players (
  id               uuid primary key default gen_random_uuid(),
  handle           text not null unique check (handle ~ '^[a-z0-9_]{3,20}$' and handle <> 'me'),
  display_name     text not null check (char_length(display_name) between 1 and 32),
  avatar_hue       smallint not null default floor(random() * 360)::smallint check (avatar_hue between 0 and 359),
  install_key_hash text not null unique,
  created_at       timestamptz not null default now()
);

create table if not exists wais (
  id         uuid primary key,                 -- client-generated → idempotent retries
  player_id  uuid not null references players(id) on delete cascade,
  session_id text not null check (char_length(session_id) between 1 and 64),
  source     text not null check (source in ('claude_code', 'shell', 'extension')),
  kind       text not null check (kind in ('prompt', 'subagent')),
  level      smallint not null check (level between 0 and 3),
  score      smallint not null check (score between 0 and 100),
  hold_ms    integer  not null check (hold_ms between 0 and 60000),
  passed     boolean  not null,
  action     text not null check (action in ('allow', 'retry', 'deny', 'rage_quit')),
  forgave    boolean  not null default false,
  anger      smallint not null default 0 check (anger between 0 and 6),
  client_ts  timestamptz,
  created_at timestamptz not null default now(),  -- server time; every window uses this
  check (not passed or (level >= 1 and hold_ms >= 1000 and action = 'allow')),
  check (passed or action <> 'allow'),
  check (not forgave or (passed and level = 3))
);

create index if not exists wais_created_idx        on wais (created_at, id);
create index if not exists wais_player_created_idx on wais (player_id, created_at desc);

alter table players enable row level security;
alter table wais    enable row level security;
