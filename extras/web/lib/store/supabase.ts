// Supabase store. Reads every row into a Snapshot (cached 10 s) and lets the shared engine compute —
// fine up to ~100k wais. Past that, move the hot queries to SQL (see docs/ARCHITECTURE.md §Scaling).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PlayerRow, Snapshot } from '../engine';
import { addPlayer, addWai, emptySnapshot } from '../engine';
import { ApiError } from '../errors';
import { iso } from '../time';
import type { AvatarSource, WaiSubmission } from '../types';
import { sameWai } from '../validate';
import { hashKey, newInstallKey } from './keys';
import { MAX_STICKERS_PER_PLAYER, type InsertResult, type Store } from './types';

const TTL = 10_000;
const PAGE = 1000;
const WAI_COLS = 'id, player_id, session_id, source, kind, level, score, hold_ms, passed, action, forgave, anger, client_ts, created_at, sticker_v';

const PLAYER_COLS = 'id, handle, display_name, avatar_hue, created_at, avatar_v, avatar_source';
interface DbPlayer { id: string; handle: string; display_name: string; avatar_hue: number; created_at: string; avatar_v?: number; avatar_source?: AvatarSource }
interface DbWai extends Omit<WaiSubmission, 'client_ts'> { player_id: string; client_ts: string | null; created_at: string; sticker_v?: number }

const toPlayer = (r: DbPlayer): PlayerRow => ({ ...r, created_at: Date.parse(r.created_at) });
const toSubmission = (r: DbWai): WaiSubmission => ({
  id: r.id, session_id: r.session_id, source: r.source, kind: r.kind, level: r.level, score: r.score, hold_ms: r.hold_ms,
  passed: r.passed, action: r.action, forgave: r.forgave, anger: r.anger, client_ts: r.client_ts ?? '',
});

export function createSupabaseStore(url: string, serviceKey: string): Store {
  const db: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let cached: { at: number; snap: Snapshot } | null = null;
  let inflight: Promise<Snapshot> | null = null;
  const authCache = new Map<string, { at: number; player: PlayerRow }>();

  async function load(): Promise<Snapshot> {
    const s = emptySnapshot();
    const { data: players, error } = await db.from('players').select(PLAYER_COLS).order('created_at');
    if (error) throw error;
    const index = new Map<string, number>();
    for (const p of players as DbPlayer[]) index.set(p.id, addPlayer(s, toPlayer(p)));
    for (let from = 0; ; from += PAGE) {
      const { data, error: e } = await db.from('wais').select(WAI_COLS).order('created_at').order('id').range(from, from + PAGE - 1);
      if (e) throw e;
      for (const r of data as DbWai[]) {
        const p = index.get(r.player_id);
        if (p === undefined) continue;
        addWai(s, { ...toSubmission(r), p, t: Date.parse(r.created_at), client_ts: r.client_ts ? Date.parse(r.client_ts) : null, sticker: r.sticker_v ?? 0 });
      }
      if (data.length < PAGE) break;
    }
    return s;
  }

  const invalidate = () => { cached = null; };
  const ver = () => Math.floor(Date.now() / 1000);
  async function ownedWai(player: PlayerRow, waiId: string) {
    const { data, error } = await db.from('wais').select('id, sticker_v').eq('id', waiId).eq('player_id', player.id).maybeSingle();
    if (error) throw error;
    return data as { id: string; sticker_v: number } | null;
  }

  return {
    kind: 'supabase',
    mode: 'supabase',
    async snapshot() {
      if (cached && Date.now() - cached.at < TTL) return cached.snap;
      inflight ??= load().then((snap) => { cached = { at: Date.now(), snap }; return snap; }).finally(() => { inflight = null; });
      return inflight;
    },
    async register(handle, display_name) {
      const install_key = newInstallKey();
      const { data, error } = await db.from('players')
        .insert({ handle, display_name, install_key_hash: hashKey(install_key) })
        .select(PLAYER_COLS).single();
      if (error?.code === '23505') throw new ApiError(409, 'handle_taken', `@${handle} is taken`, 'handle');
      if (error) throw error;
      invalidate();
      return { player: toPlayer(data as DbPlayer), install_key };
    },
    async authenticate(key) {
      const h = hashKey(key), hit = authCache.get(h);
      if (hit && Date.now() - hit.at < 60_000) return hit.player;
      const { data, error } = await db.from('players').select(PLAYER_COLS).eq('install_key_hash', h).maybeSingle();
      if (error) throw error;
      if (!data) throw new ApiError(401, 'unauthorized', 'unknown install key');
      const player = toPlayer(data as DbPlayer);
      authCache.set(h, { at: Date.now(), player });
      return player;
    },
    async updatePlayer(id, patch) {
      const { data, error } = await db.from('players').update(patch).eq('id', id).select(PLAYER_COLS).single();
      if (error) throw error;
      authCache.clear();
      invalidate();
      return toPlayer(data as DbPlayer);
    },
    async insertWais(player, items) {
      if (!items.length) return [];
      const rows = items.map((w) => ({ ...w, player_id: player.id }));
      const { data, error } = await db.from('wais').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }).select('id, created_at');
      if (error) throw error;
      const inserted = new Map((data as { id: string; created_at: string }[]).map((r) => [r.id, r.created_at]));
      const dupIds = items.filter((w) => !inserted.has(w.id)).map((w) => w.id);
      const existing = new Map<string, DbWai>();
      if (dupIds.length) {
        const { data: ex, error: e2 } = await db.from('wais').select(WAI_COLS).in('id', dupIds);
        if (e2) throw e2;
        for (const r of ex as DbWai[]) existing.set(r.id, r);
      }
      invalidate();
      return items.map((w): InsertResult => {
        const at = inserted.get(w.id);
        if (at) return { id: w.id, status: 201, created_at: iso(Date.parse(at)) };
        const ex = existing.get(w.id);
        return ex && ex.player_id === player.id && sameWai(toSubmission(ex), w)
          ? { id: w.id, status: 200, created_at: iso(Date.parse(ex.created_at)) }
          : { id: w.id, status: 409, error: { code: 'duplicate', message: 'same id with a different body' } };
      });
    },

    async putSticker(player, waiId, png) {
      const w = await ownedWai(player, waiId);
      if (!w) throw new ApiError(404, 'not_found', 'no such wai for this player');
      const up = await db.storage.from('stickers').upload(`${waiId}.png`, png, { contentType: 'image/png', upsert: true });
      if (up.error) throw up.error;
      const v = Math.max(ver(), (w.sticker_v || 0) + 1);
      const { error } = await db.from('wais').update({ sticker_v: v }).eq('id', waiId);
      if (error) throw error;
      // keep only the newest MAX_STICKERS_PER_PLAYER
      const { data: all, error: e2 } = await db.from('wais').select('id').eq('player_id', player.id).gt('sticker_v', 0)
        .order('created_at', { ascending: false }).range(MAX_STICKERS_PER_PLAYER, MAX_STICKERS_PER_PLAYER + 500);
      if (e2) throw e2;
      const old = ((all ?? []) as { id: string }[]).map((r) => r.id);
      if (old.length) {
        await db.storage.from('stickers').remove(old.map((id) => `${id}.png`));
        await db.from('wais').update({ sticker_v: 0 }).in('id', old);
      }
      invalidate();
      return v;
    },
    async getSticker(waiId) {
      const { data, error } = await db.storage.from('stickers').download(`${waiId}.png`);
      if (error || !data) return null;
      return { bytes: new Uint8Array(await data.arrayBuffer()), mime: 'image/png' };
    },
    async deleteSticker(player, waiId) {
      const w = await ownedWai(player, waiId);
      if (!w || !w.sticker_v) return false;
      await db.storage.from('stickers').remove([`${waiId}.png`]);
      const { error } = await db.from('wais').update({ sticker_v: 0 }).eq('id', waiId);
      if (error) throw error;
      invalidate();
      return true;
    },
    async deleteAllStickers(player) {
      const { data, error } = await db.from('wais').select('id').eq('player_id', player.id).gt('sticker_v', 0);
      if (error) throw error;
      const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
      for (let i = 0; i < ids.length; i += 100) {
        const part = ids.slice(i, i + 100);
        await db.storage.from('stickers').remove(part.map((id) => `${id}.png`));
        const { error: e2 } = await db.from('wais').update({ sticker_v: 0 }).in('id', part);
        if (e2) throw e2;
      }
      invalidate();
      return ids.length;
    },
    async putAvatar(player, bytes, mime) {
      const up = await db.storage.from('avatars').upload(player.id, bytes, { contentType: mime, upsert: true });
      if (up.error) throw up.error;
      const { error } = await db.from('players')
        .update({ avatar_v: Math.max(ver(), (player.avatar_v || 0) + 1), avatar_mime: mime, avatar_source: 'photo' }).eq('id', player.id);
      if (error) throw error;
      authCache.clear();
      invalidate();
    },
    async getAvatar(playerId) {
      const { data, error } = await db.storage.from('avatars').download(playerId);
      if (error || !data) return null;
      return { bytes: new Uint8Array(await data.arrayBuffer()), mime: data.type || 'image/png' };
    },
    async deleteAvatar(player) {
      await db.storage.from('avatars').remove([player.id]);
      const { error } = await db.from('players').update({ avatar_v: 0, avatar_mime: null, avatar_source: 'generated' }).eq('id', player.id);
      if (error) throw error;
      authCache.clear();
      invalidate();
    },
    async setAvatarSource(player, source) {
      const { error } = await db.from('players').update({ avatar_source: source }).eq('id', player.id);
      if (error) throw error;
      authCache.clear();
      invalidate();
    },
  };
}
