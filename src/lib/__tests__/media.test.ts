import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatBytes, formatDuration, MEDIA_CAPS } from "../media";
import {
  isCloudinaryUrl,
  publicIdFromUrl,
  thumbUrl,
  videoPosterUrl,
} from "../cloudinary";

describe("media helpers", () => {
  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(42)).toBe("0:42");
    expect(formatDuration(125)).toBe("2:05");
  });

  it("caps fit the free-tier budget", () => {
    // A max-length voice note must stay small enough to be irrelevant
    // next to the 1 GB/day download quota.
    const worstVoiceBytes = (MEDIA_CAPS.voiceMaxSeconds * MEDIA_CAPS.voiceBitrate) / 8;
    expect(worstVoiceBytes).toBeLessThan(1024 * 1024);
    expect(MEDIA_CAPS.videoMaxSeconds).toBeLessThanOrEqual(60);
    expect(MEDIA_CAPS.imageMaxEdge).toBeLessThanOrEqual(1600);
  });
});

describe("cloudinary urls", () => {
  const CLOUD = "demo";
  const OLD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  beforeAll(() => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = CLOUD;
  });
  afterAll(() => {
    if (OLD === undefined) delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    else process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = OLD;
  });

  const img = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/42social/u1/a_b.webp`;
  const vid = `https://res.cloudinary.com/${CLOUD}/video/upload/v2/42social/u1/c_d.mp4`;

  it("accepts only our own deliveries", () => {
    expect(isCloudinaryUrl(img)).toBe(true);
    expect(isCloudinaryUrl("https://evil.com/x.webp")).toBe(false);
    expect(
      isCloudinaryUrl(`https://res.cloudinary.com/other/image/upload/v1/x.webp`)
    ).toBe(false);
    expect(isCloudinaryUrl("not-a-url")).toBe(false);
  });

  it("builds thumbnails and posters without new uploads", () => {
    expect(thumbUrl(img)).toBe(
      `https://res.cloudinary.com/${CLOUD}/image/upload/w_320,q_auto,f_auto/v1/42social/u1/a_b.webp`
    );
    expect(videoPosterUrl(vid)).toBe(
      `https://res.cloudinary.com/${CLOUD}/video/upload/so_0,w_480,q_auto,f_jpg/v2/42social/u1/c_d.jpg`
    );
    expect(thumbUrl("https://evil.com/x.webp")).toBeNull();
  });

  it("extracts public ids for destroy", () => {
    expect(publicIdFromUrl(img)).toBe("42social/u1/a_b");
    expect(publicIdFromUrl(vid)).toBe("42social/u1/c_d");
    expect(
      publicIdFromUrl(
        `https://res.cloudinary.com/${CLOUD}/image/upload/w_320,q_auto,f_auto/v1/42social/u1/a_b.webp`
      )
    ).toBe("42social/u1/a_b");
    expect(publicIdFromUrl("https://evil.com/x.webp")).toBeNull();
  });
});
