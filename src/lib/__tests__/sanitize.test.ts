import { describe, expect, it } from "vitest";
import { clean, graphemeLen, takeGraphemes } from "@/lib/sanitize";

describe("sanitize (skill: clean-code input hardening)", () => {
  it("trims and strips carriage returns", () => {
    expect(clean("  hello\r\n", 50)).toBe("hello");
  });

  it("caps by grapheme without splitting compound emoji", () => {
    const family = "👨‍👩‍👧‍👦";
    expect(graphemeLen(family)).toBe(1);
    expect(takeGraphemes(`${family}ab`, 2)).toBe(`${family}a`);
  });

  it("returns empty for blank input", () => {
    expect(clean("   ", 10)).toBe("");
  });
});
