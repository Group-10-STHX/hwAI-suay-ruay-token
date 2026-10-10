import 'server-only';
import { createMemoryStore } from './memory';
import { createSupabaseStore } from './supabase';
import type { Store } from './types';

const g = globalThis as unknown as { __waiStore?: Store };

/** Process-wide singleton (survives dev hot reloads). WAI_DATA=supabase switches backends. WAI_BLOCK_MOCK=1 (memory only) starts empty: no seed, no simulation. */
export function getStore(): Store {
  if (g.__waiStore) return g.__waiStore;
  if (process.env.WAI_DATA === 'supabase') {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('WAI_DATA=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    g.__waiStore = createSupabaseStore(url, key);
  } else {
    g.__waiStore = createMemoryStore({ withMock: process.env.WAI_BLOCK_MOCK !== '1' });
  }
  return g.__waiStore;
}

export type { Store } from './types';
