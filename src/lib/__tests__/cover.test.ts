import { describe, expect, it } from "vitest";
import { extractOgImage, extractOgVideo, resolveCoverUrl } from "../cover";

describe("extractOgImage", () => {
  it("reads og:image in both attribute orders", () => {
    expect(
      extractOgImage(
        `<html><head><meta property="og:image" content="https://i.pinimg.com/originals/a/b/c.gif" /></head></html>`
      )
    ).toBe("https://i.pinimg.com/originals/a/b/c.gif");
    expect(
      extractOgImage(
        `<meta content="https://i.pinimg.com/originals/a/b/c.png" property="og:image" />`
      )
    ).toBe("https://i.pinimg.com/originals/a/b/c.png");
  });

  it("falls back to twitter:image and decodes entities", () => {
    expect(
      extractOgImage(
        `<meta name="twitter:image" content="https://i.pinimg.com/x.jpg?x=1&amp;y=2" />`
      )
    ).toBe("https://i.pinimg.com/x.jpg?x=1&y=2");
  });

  it("rejects non-https and missing tags", () => {
    expect(
      extractOgImage(`<meta property="og:image" content="http://x.com/a.gif" />`)
    ).toBeNull();
    expect(extractOgImage(`<html><head></head></html>`)).toBeNull();
    expect(extractOgImage("")).toBeNull();
  });
});

describe("extractOgVideo", () => {
  it("prefers secure_url in both attribute orders", () => {
    expect(
      extractOgVideo(
        `<meta property="og:video:secure_url" content="https://v.pinimg.com/videos/a/b.mp4" />`
      )
    ).toBe("https://v.pinimg.com/videos/a/b.mp4");
    expect(
      extractOgVideo(
        `<meta content="https://v.pinimg.com/videos/a/b.mp4" property="og:video" />`
      )
    ).toBe("https://v.pinimg.com/videos/a/b.mp4");
  });

  it("rejects non-https and missing tags", () => {
    expect(
      extractOgVideo(`<meta property="og:video" content="http://x.com/a.mp4" />`)
    ).toBeNull();
    expect(extractOgVideo(`<html><head></head></html>`)).toBeNull();
  });
});

describe("resolveCoverUrl", () => {
  it("passes direct image links through (no video)", async () => {
    expect(await resolveCoverUrl("https://media.giphy.com/media/x/giphy.gif")).toEqual({
      image: "https://media.giphy.com/media/x/giphy.gif",
      video: null,
    });
    expect(
      await resolveCoverUrl("https://x.com/a.PNG?w=1")
    ).toEqual({ image: "https://x.com/a.PNG?w=1", video: null });
  });

  it("accepts raw Pinterest video pastes as animated covers", async () => {
    expect(
      await resolveCoverUrl("https://v.pinimg.com/videos/a/b/c.mp4")
    ).toEqual({ image: null, video: "https://v.pinimg.com/videos/a/b/c.mp4" });
  });

  it("rejects pages, wrong schemes, and garbage", async () => {
    expect(await resolveCoverUrl("https://x.com/gallery")).toBeNull();
    expect(await resolveCoverUrl("http://x.com/a.gif")).toBeNull();
    expect(await resolveCoverUrl("data:image/gif;base64,xx")).toBeNull();
    expect(await resolveCoverUrl("")).toBeNull();
    expect(await resolveCoverUrl(null)).toBeNull();
  });
});
