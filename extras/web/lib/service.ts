import 'server-only';
import { getStore } from './store';

/** Store + fresh snapshot + a single `now` for one request. */
export async function current() {
  const store = getStore();
  const snap = await store.snapshot();
  return { store, snap, now: Date.now() };
}
