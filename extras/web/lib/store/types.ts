import type { PlayerRow, Snapshot } from '../engine';
import type { AvatarSource, StoreMode, WaiSubmission } from '../types';
import type { AvatarMime } from '../image';

export interface InsertResult {
  id: string;
  status: 200 | 201 | 400 | 409;
  created_at?: string;
  error?: { code: string; message: string; field?: string };
}

export interface Store {
  kind: 'mock' | 'supabase';
  /** simulation = memory + seeded mock data; real-only = memory, WAI_BLOCK_MOCK=1; supabase = real DB. */
  mode: StoreMode;
  /** Current rows. Cheap to call; implementations cache. */
  snapshot(): Promise<Snapshot>;
  register(handle: string, display_name: string): Promise<{ player: PlayerRow; install_key: string }>;
  /** Resolve an install key to its player or throw 401. */
  authenticate(key: string): Promise<PlayerRow>;
  updatePlayer(id: string, patch: { display_name?: string; avatar_hue?: number }): Promise<PlayerRow>;
  /** Idempotent by wai id: 201 new, 200 identical replay, 409 same id with a different body. */
  insertWais(player: PlayerRow, items: WaiSubmission[]): Promise<InsertResult[]>;

  // ---- images (bytes already validated by the route) ----
  /** Store or replace the sticker of a wai owned by `player` (404 otherwise). Keeps the player's newest 60. Returns the new version. */
  putSticker(player: PlayerRow, waiId: string, png: Uint8Array): Promise<number>;
  /** Bytes of a sticker; simulated mock stickers come back as image/svg+xml. null if none. */
  getSticker(waiId: string): Promise<{ bytes: Uint8Array; mime: string } | null>;
  deleteSticker(player: PlayerRow, waiId: string): Promise<boolean>;
  deleteAllStickers(player: PlayerRow): Promise<number>;
  putAvatar(player: PlayerRow, bytes: Uint8Array, mime: AvatarMime): Promise<void>;
  getAvatar(playerId: string): Promise<{ bytes: Uint8Array; mime: string } | null>;
  deleteAvatar(player: PlayerRow): Promise<void>;
  setAvatarSource(player: PlayerRow, source: AvatarSource): Promise<void>;
}

export const MAX_STICKERS_PER_PLAYER = 60;
