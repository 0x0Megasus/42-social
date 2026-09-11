// In-memory sliding-window rate limits (single-process v1).
// For multi-instance production, move this to Redis.

const hits = new Map<string, number[]>();
const lastBody = new Map<string, { body: string; at: number }>();

function prune() {
  if (hits.size < 2000 && lastBody.size < 2000) return;
  const now = Date.now();
  for (const [k, v] of hits)
    if (v.length === 0 || now - v[v.length - 1] > 3_600_000) hits.delete(k);
  for (const [k, v] of lastBody) if (now - v.at > 3_600_000) lastBody.delete(k);
}

/** Sliding window: at most `limit` hits per `windowMs`. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    const retryAfter = Math.max(1, Math.ceil((arr[0] + windowMs - now) / 1000));
    hits.set(key, arr);
    return { ok: false, retryAfter };
  }
  arr.push(now);
  hits.set(key, arr);
  prune();
  return { ok: true, retryAfter: 0 };
}

/** True if the same body was sent within `windowMs` (spam/double-submit). */
export function isDuplicate(
  key: string,
  body: string,
  windowMs: number
): boolean {
  const now = Date.now();
  const prev = lastBody.get(key);
  lastBody.set(key, { body, at: now });
  prune();
  return !!prev && prev.body === body && now - prev.at < windowMs;
}
