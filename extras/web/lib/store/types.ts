import type { PlayerRow, Snapshot } from '../engine';
import type { WaiSubmission } from '../types';

export interface InsertResult {
  id: string;
  status: 200 | 201 | 400 | 409;
  created_at?: string;
  error?: { code: string; message: string; field?: string };
}

export interface Store {
  kind: 'mock' | 'supabase';
  /** Current rows. Cheap to call; implementations cache. */
  snapshot(): Promise<Snapshot>;
  register(handle: string, display_name: string): Promise<{ player: PlayerRow; install_key: string }>;
  /** Resolve an install key to its player or throw 401. */
  authenticate(key: string): Promise<PlayerRow>;
  updatePlayer(id: string, patch: { display_name?: string; avatar_hue?: number }): Promise<PlayerRow>;
  /** Idempotent by wai id: 201 new, 200 identical replay, 409 same id with a different body. */
  insertWais(player: PlayerRow, items: WaiSubmission[]): Promise<InsertResult[]>;
}
