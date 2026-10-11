-- WAI-NET stickers and profile pictures. Apply after 0001_init.sql.
-- Image bytes live in private Storage buckets (`stickers`, `avatars`); the Next.js API serves them
-- with the service-role key, so no public bucket policy is needed. Only versions/metadata live in tables.
-- NOTE: written against the Supabase docs, never applied to a real project (compile-checked only).

alter table wais
  add column if not exists sticker_v integer not null default 0;           -- 0 = none; bumps on every replace

alter table players
  add column if not exists avatar_v      integer not null default 0,       -- 0 = no photo
  add column if not exists avatar_mime   text check (avatar_mime in ('image/png', 'image/jpeg', 'image/webp')),
  add column if not exists avatar_source text not null default 'auto'
    check (avatar_source in ('auto', 'generated', 'photo', 'sticker'));

-- "keep the newest 60 stickers per player" is enforced by the API; this index makes that lookup cheap.
create index if not exists wais_player_sticker_idx on wais (player_id, created_at desc) where sticker_v > 0;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('stickers', 'stickers', false, 409600, array['image/png']),
  ('avatars',  'avatars',  false, 256000, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
