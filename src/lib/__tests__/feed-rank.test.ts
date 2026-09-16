import { describe, expect, it } from "vitest";
import { postScore, rankFeed, type RankContext } from "@/lib/feed-rank";

const now = Date.now();
const hour = 3_600_000;

const mk = (
  over: Partial<Parameters<typeof postScore>[0]> & { id: string }
) => ({
  authorId: "a",
  createdAt: new Date(now - hour).toISOString(),
  likes: 0,
  comments: 0,
  hasImage: false,
  likerIds: [] as string[],
  ...over,
});

const ctx = (over: Partial<RankContext> = {}): RankContext => ({
  meId: "me",
  following: new Set<string>(),
  interactedAuthors: new Set<string>(),
  ...over,
});

describe("feed-rank (Facebook-style pipeline)", () => {
  it("ranks followed + engaging above stale-but-big posts", () => {
    const old = mk({
      id: "old",
      authorId: "a",
      createdAt: new Date(now - 48 * hour).toISOString(),
      likes: 100,
      comments: 50,
    });
    const freshFollowed = mk({
      id: "fresh",
      authorId: "b",
      createdAt: new Date(now - hour).toISOString(),
      likes: 2,
      comments: 3,
    });
    const ranked = rankFeed(
      [old, freshFollowed],
      ctx({ following: new Set(["b"]) }),
      now
    );
    expect(ranked[0].id).toBe("fresh");
    expect(
      postScore(freshFollowed, ctx({ following: new Set(["b"]) }), now)
    ).toBeGreaterThan(0);
  });

  it("tiers affinity: own > followed > interacted > stranger", () => {
    const t = new Date(now - 2 * hour).toISOString();
    const c = ctx({
      following: new Set(["f"]),
      interactedAuthors: new Set(["i"]),
    });
    const score = (authorId: string) =>
      postScore(mk({ id: authorId, authorId, createdAt: t }), c, now);
    expect(score("me")).toBeGreaterThan(score("f"));
    expect(score("f")).toBeGreaterThan(score("i"));
    expect(score("i")).toBeGreaterThan(score("s"));
  });

  it("boosts friends-liked posts and rich media", () => {
    const base = mk({ id: "x", createdAt: new Date(now - 5 * hour).toISOString() });
    const plain = postScore(base, ctx(), now);
    const friendLiked = postScore(
      { ...base, likerIds: ["f1", "f2"] },
      ctx({ following: new Set(["f1", "f2"]) }),
      now
    );
    const withImage = postScore({ ...base, hasImage: true }, ctx(), now);
    expect(friendLiked).toBeGreaterThan(plain);
    expect(withImage).toBeGreaterThan(plain);
  });

  it("demotes old zero-engagement posts (integrity)", () => {
    const dead = mk({
      id: "dead",
      createdAt: new Date(now - 72 * hour).toISOString(),
    });
    const fresh = mk({
      id: "fresh",
      createdAt: new Date(now - hour).toISOString(),
    });
    expect(postScore(fresh, ctx(), now)).toBeGreaterThan(
      postScore(dead, ctx(), now)
    );
  });

  it("mixes authors and media types (diversity)", () => {
    const img = (id: string, authorId: string) =>
      mk({
        id,
        authorId,
        hasImage: true,
        createdAt: new Date(now - hour).toISOString(),
      });
    const txt = (id: string, authorId: string) =>
      mk({
        id,
        authorId,
        createdAt: new Date(now - hour).toISOString(),
      });
    const ranked = rankFeed(
      [img("1", "a"), img("2", "a"), txt("3", "b"), txt("4", "c")],
      ctx(),
      now
    );
    const ids = ranked.map((p) => p.id);
    for (let i = 1; i < ids.length; i++) {
      const prev = ranked.find((p) => p.id === ids[i - 1])!;
      const cur = ranked.find((p) => p.id === ids[i])!;
      if (cur.authorId === prev.authorId) {
        expect(
          ranked.every((p) => p.authorId === cur.authorId)
        ).toBe(true);
      }
    }
    expect(ids).toContain("3");
  });
});
