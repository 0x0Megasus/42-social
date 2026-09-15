import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cached, invalidatePrefix } from "../cache";

describe("cached", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    invalidatePrefix("");
  });

  it("returns the fetched value and serves TTL hits without refetching", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      return "v";
    };
    await expect(cached("k1", 10_000, fn)).resolves.toBe("v");
    await expect(cached("k1", 10_000, fn)).resolves.toBe("v");
    expect(calls).toBe(1);
  });

  it("refetches after TTL expiry", async () => {
    let calls = 0;
    const fn = async () => ++calls;
    await cached("k2", 1_000, fn);
    vi.advanceTimersByTime(1_001);
    await cached("k2", 1_000, fn);
    expect(calls).toBe(2);
  });

  it("single-flights concurrent cold requests", async () => {
    let calls = 0;
    let release!: (v: string) => void;
    const gate = new Promise<string>((r) => (release = r));
    const fn = async () => {
      calls++;
      return gate;
    };
    const pending = Promise.all([
      cached("k3", 10_000, fn),
      cached("k3", 10_000, fn),
      cached("k3", 10_000, fn),
    ]);
    release("done");
    const results = await pending;
    expect(calls).toBe(1);
    expect(results).toEqual(["done", "done", "done"]);
  });

  it("failed fetches do not poison the cache", async () => {
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls === 1) throw new Error("boom");
      return "ok";
    };
    await expect(cached("k4", 10_000, flaky)).rejects.toThrow("boom");
    await expect(cached("k4", 10_000, flaky)).resolves.toBe("ok");
    expect(calls).toBe(2);
  });

  it("invalidatePrefix drops only matching keys", async () => {
    let calls = 0;
    const fn = async () => ++calls;
    await cached("user:a", 60_000, fn);
    await cached("user:b", 60_000, fn);
    invalidatePrefix("user:a");
    await cached("user:a", 60_000, fn);
    await cached("user:b", 60_000, fn);
    expect(calls).toBe(3);
  });
});
