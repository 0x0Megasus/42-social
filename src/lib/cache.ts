// Tiny server-side cache: TTL LRU + single-flight.
//
// Why this shape (skill: database-architect, cache-aside):
// - Serverless instances don't share memory, so this is strictly a
//   per-instance burst absorber, not a source of truth. Every entry has a
//   short TTL (seconds) — worst case a reader sees seconds-old profile
//   data, never wrong writes (writes always go to RTDB).
// - Single-flight: N concurrent requests for the same cold key trigger ONE
//   upstream fetch (thundering-herd protection on popular profiles/posts).
// - Bounded size (LRU eviction) so a large user base can't grow memory.

type Entry = { at: number; value: unknown; inflight?: Promise<unknown> };

const MAX_ENTRIES = 500;
const store = new Map<string, Entry>();

function touch(key: string, entry: Entry): void {
  // Map preserves insertion order — re-insert = most-recently-used.
  store.delete(key);
  store.set(key, entry);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && !hit.inflight && now - hit.at < ttlMs) {
    touch(key, hit);
    return hit.value as T;
  }
  if (hit?.inflight) return hit.inflight as Promise<T>;
  const entry: Entry = { at: now, value: undefined };
  const p = fn().then(
    (v) => {
      entry.at = Date.now();
      entry.value = v;
      entry.inflight = undefined;
      touch(key, entry);
      return v;
    },
    (e) => {
      // Failed fetch must not poison the cache — drop the entry so the
      // next caller retries upstream.
      store.delete(key);
      throw e;
    }
  );
  entry.inflight = p;
  store.set(key, entry);
  return p;
}

export function invalidatePrefix(prefix: string): void {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
