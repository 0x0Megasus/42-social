// Single place for site identity + owner links.
export const SITE = {
  name: "42·social",
  ownerName: "0x0m3g4sus",
  instagramUrl: "https://instagram.com/itsmegasus",
  intraUrl: "https://profile.intra.42.fr/users/aech-cha",
} as const;

export type ProfileTarget = "instagram" | "intra";

export function profileUrl(target: ProfileTarget): string {
  return target === "instagram" ? SITE.instagramUrl : SITE.intraUrl;
}
