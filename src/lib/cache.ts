
type Entry = { at: number; value: unknown; inflight?: Promise<unknown> };

const MAX_ENTRIES = 500;
const store = new Map<string, Entry>();

function touch(key: string, entry: Entry): void {
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
