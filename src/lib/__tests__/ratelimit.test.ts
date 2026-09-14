import { describe, expect, it } from "vitest";
import { isDuplicate, rateLimit, rateLimitInfo } from "@/lib/ratelimit";

describe("ratelimit (skill: api-design-principles standard headers)", () => {
  it("allows up to the limit then rejects with retryAfter", () => {
    const key = `t-${Date.now()}-${Math.random()}`;
    expect(rateLimit(key, 2, 60_000).ok).toBe(true);
    expect(rateLimit(key, 2, 60_000).ok).toBe(true);
    const third = rateLimit(key, 2, 60_000);
    expect(third.ok).toBe(false);
    expect(third.retryAfter).toBeGreaterThan(0);
  });

  it("exposes remaining/reset info for X-RateLimit-* headers", () => {
    const key = `i-${Date.now()}-${Math.random()}`;
    rateLimit(key, 5, 60_000);
    const info = rateLimitInfo(key, 5, 60_000);
    expect(info.remaining).toBe(4);
    expect(info.resetSeconds).toBeGreaterThan(0);
  });

  it("flags repeat bodies as duplicates within the window", () => {
    const key = `d-${Date.now()}-${Math.random()}`;
    expect(isDuplicate(key, "hello", 60_000)).toBe(false);
    expect(isDuplicate(key, "hello", 60_000)).toBe(true);
    expect(isDuplicate(key, "other", 60_000)).toBe(false);
  });
});
