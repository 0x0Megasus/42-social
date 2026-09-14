import { describe, expect, it } from "vitest";
import { postScore, rankFeed } from "@/lib/feed-rank";

const base = {
  likes: 0,
  comments: 0,
};

describe("feed-rank (skill: react-best-practices js-min-max-loop)", () => {
  it("ranks engaging + followed posts above stale ones", () => {
    const now = Date.now();
    const old = {
      ...base,
      id: "old",
      authorId: "a",
      createdAt: new Date(now - 48 * 3_600_000).toISOString(),
      likes: 100,
      comments: 50,
    };
    const freshFollowed = {
      ...base,
      id: "fresh",
      authorId: "b",
      createdAt: new Date(now - 1 * 3_600_000).toISOString(),
      likes: 2,
      comments: 3,
    };
    const ranked = rankFeed([old, freshFollowed], "me", ["b"], now);
    expect(ranked[0].id).toBe("fresh");
    expect(postScore(freshFollowed, "me", new Set(["b"]), now)).toBeGreaterThan(0);
  });

  it("avoids same-author runs when avoidable (diversity pass)", () => {
    const now = Date.now();
    const mk = (id: string, authorId: string) => ({
      ...base,
      id,
      authorId,
      createdAt: new Date(now - 3_600_000).toISOString(),
    });
    const ranked = rankFeed(
      [mk("1", "a"), mk("2", "a"), mk("3", "b")],
      null,
      [],
      now
    );
    expect(ranked.map((p) => p.id)).toEqual(["1", "3", "2"]);
  });
});
