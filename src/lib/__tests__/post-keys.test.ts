import { describe, expect, it } from "vitest";
import { collectionEntries, normalizePost, type Post } from "../db";
import { countLivePostsByAuthor, counterNeedsWrite } from "../counters";
import { selectPinnedPosts, MAX_PINNED } from "../feed";
import { timeAgo } from "../format";

function makePost(id: string, extra: Partial<Post> = {}): Post {
  return {
    id,
    authorId: "u_1",
    body: "hello",
    image: null,
    thumb: null,
    video: null,
    edited: false,
    deleted: false,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

describe("collectionEntries (storage-key reads)", () => {
  it("preserves keys across null holes in array snapshots", () => {
    const a = makePost("p_a");
    const c = makePost("p_c");
    const entries = collectionEntries("posts", [a, null, c]);
    expect(entries.map((e) => e.key)).toEqual(["0", "2"]);
    expect(entries.map((e) => e.row.id)).toEqual(["p_a", "p_c"]);
  });

  it("preserves keys across gaps in object snapshots", () => {
    const a = makePost("p_a");
    const c = makePost("p_c");
    const entries = collectionEntries("posts", { 0: a, 2: c });
    expect(entries.map((e) => e.key)).toEqual(["0", "2"]);
  });

  it("skips non-object rows", () => {
    const a = makePost("p_a");
    const entries = collectionEntries("posts", [a, 42, "x", null]);
    expect(entries.map((e) => e.key)).toEqual(["0"]);
  });

  it("returns [] for missing nodes", () => {
    expect(collectionEntries("posts", null)).toEqual([]);
    expect(collectionEntries("posts", undefined)).toEqual([]);
  });

  it("survives sparse arrays (deleted slots as holes, not nulls)", () => {
    const sparse: unknown[] = new Array(3);
    sparse[0] = makePost("p_a");
    sparse[2] = makePost("p_c");
    const entries = collectionEntries("posts", sparse);
    expect(entries.map((e) => e.key)).toEqual(["0", "2"]);
    expect(entries.map((e) => e.row.id)).toEqual(["p_a", "p_c"]);
  });
});

describe("edit-after-delete ghost regression", () => {
  it("resolves C to storage key 2, not compacted index 1", () => {
    const val = { 0: makePost("p_a"), 2: makePost("p_c") };
    const entries = collectionEntries("posts", val);
    const hit = entries.find(({ row }) => row.id === "p_c");
    expect(hit?.key).toBe("2");

    const compacted = entries.map(({ row }) => row);
    expect(compacted.findIndex((p) => p.id === "p_c")).toBe(1);
    expect(hit?.key).not.toBe(
      String(compacted.findIndex((p) => p.id === "p_c"))
    );
  });
});

describe("normalizePost", () => {
  it("defaults every nullable media/counter field (no undefined writes)", () => {
    const row = normalizePost({
      id: "p_x",
      authorId: "u_1",
      body: "x",
      createdAt: new Date().toISOString(),
    } as Post);
    expect(row.image).toBeNull();
    expect(row.thumb).toBeNull();
    expect(row.video).toBeNull();
    expect(row.cloudIds).toBeNull();
    expect(row.imgW).toBeNull();
    expect(row.imgH).toBeNull();
    expect(row.author).toBeNull();
    expect(row.likesCount).toBe(0);
    expect(row.commentsCount).toBe(0);
    expect(row.edited).toBe(false);
    expect(row.deleted).toBe(false);
    expect(row.pinned).toBe(false);
    expect(row.pinnedAt).toBeNull();
  });
});

describe("countLivePostsByAuthor", () => {
  it("counts only non-deleted rows by the author", () => {
    const rows = [
      makePost("p_a", { authorId: "u_1" }),
      makePost("p_b", { authorId: "u_1", deleted: true }),
      makePost("p_c", { authorId: "u_2" }),
      { deleted: false } as Post,
    ];
    expect(countLivePostsByAuthor(rows, "u_1")).toBe(1);
    expect(countLivePostsByAuthor(rows, "u_2")).toBe(1);
    expect(countLivePostsByAuthor(rows, "u_3")).toBe(0);
  });
});

describe("counterNeedsWrite", () => {
  it("writes missing or drifted counters, skips exact ones", () => {
    expect(counterNeedsWrite(undefined, 1)).toBe(true);
    expect(counterNeedsWrite(0, 1)).toBe(true); // the delete-drift case
    expect(counterNeedsWrite(3, 2)).toBe(true);
    expect(counterNeedsWrite(2, 2)).toBe(false);
    expect(counterNeedsWrite(0, 0)).toBe(false);
  });
});

describe("selectPinnedPosts", () => {
  const pinned = (id: string, at: string, extra: Partial<Post> = {}) =>
    makePost(id, { pinned: true, pinnedAt: at, ...extra });

  it("returns newest-first pinned posts, skipping unpinned/deleted/id-less rows", () => {
    const rows = [
      makePost("p_plain"),
      pinned("p_old", "2026-01-01T00:00:00.000Z"),
      pinned("p_new", "2026-09-01T00:00:00.000Z"),
      pinned("p_gone", "2026-09-10T00:00:00.000Z", { deleted: true }),
      { pinned: true, pinnedAt: "2026-09-11T00:00:00.000Z" } as Post,
    ];
    expect(selectPinnedPosts(rows).map((p) => p.id)).toEqual([
      "p_new",
      "p_old",
    ]);
  });

  it("caps the announcement list", () => {
    const rows = Array.from(
      { length: MAX_PINNED + 3 },
      (_, i) =>
        pinned(
          `p_${i}`,
          `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`
        )
    );
    const sel = selectPinnedPosts(rows);
    expect(sel).toHaveLength(MAX_PINNED);
    expect(sel[0].id).toBe(`p_${MAX_PINNED + 2}`);
  });
});

describe("timeAgo", () => {
  it("never renders NaNd for corrupt timestamps", () => {
    expect(timeAgo("not-a-date")).toBe("now");
    expect(timeAgo("")).toBe("now");
    expect(timeAgo(new Date().toISOString())).toBe("now");
  });
});
