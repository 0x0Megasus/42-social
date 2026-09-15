// Cloudinary helpers — pure functions, client-safe (no secrets here).
// Free plan, no credit card: 25 monthly credits (1 GB storage/bandwidth
// or 1k transformations each). Unsigned presets let browsers upload
// directly; the server only validates URLs and destroys on delete.

export function cloudName(): string | null {
  return process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? null;
}

export function mediaReady(): boolean {
  return (
    cloudName() !== null &&
    (process.env.NEXT_PUBLIC_CLOUDINARY_PRESET_IMAGE ?? "") !== "" &&
    (process.env.NEXT_PUBLIC_CLOUDINARY_PRESET_MEDIA ?? "") !== ""
  );
}

export function presetFor(kind: "image" | "video" | "voice"): string | null {
  const key =
    kind === "image"
      ? "NEXT_PUBLIC_CLOUDINARY_PRESET_IMAGE"
      : "NEXT_PUBLIC_CLOUDINARY_PRESET_MEDIA";
  return process.env[key] ?? null;
}

// Upload endpoint per blob type. NOTE: audio uploads go to the `video`
// resource type — Cloudinary classifies all audio under video.
export function endpointFor(kind: "image" | "video" | "voice"): string {
  const cloud = cloudName();
  const resource = kind === "image" ? "image" : "video";
  return `https://api.cloudinary.com/v1_1/${cloud}/${resource}/upload`;
}

export function isCloudinaryUrl(url: string): boolean {
  const cloud = cloudName();
  if (!cloud) return false;
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === "res.cloudinary.com" &&
      u.pathname.split("/")[1] === cloud
    );
  } catch {
    return false;
  }
}

// Transformed thumbnail URL from a delivery URL — no second upload, no
// extra storage. First view costs 1 transformation, then it's CDN-cached.
// https://res.cloudinary.com/<cloud>/image/upload/<t>/<rest…>
export function thumbUrl(deliveryUrl: string, width = 320): string | null {
  if (!isCloudinaryUrl(deliveryUrl)) return null;
  try {
    const u = new URL(deliveryUrl);
    const segs = u.pathname.split("/").filter(Boolean);
    // [cloud, <image|video>, upload, ...rest]
    const upIdx = segs.indexOf("upload");
    if (upIdx < 0) return null;
    const head = segs.slice(0, upIdx + 1).join("/");
    const rest = segs.slice(upIdx + 1);
    // Transformations slot before the version/public-id tail.
    const t = `w_${width},q_auto,f_auto`;
    const path = `${head}/${t}/${rest.join("/")}`;
    return `${u.origin}/${path}`;
  } catch {
    return null;
  }
}

// Video poster frame: first frame as JPG (single transformation chain).
export function videoPosterUrl(deliveryUrl: string, width = 480): string | null {
  if (!isCloudinaryUrl(deliveryUrl)) return null;
  try {
    const u = new URL(deliveryUrl);
    const segs = u.pathname.split("/").filter(Boolean);
    const upIdx = segs.indexOf("upload");
    if (upIdx < 0) return null;
    const head = segs.slice(0, upIdx + 1).join("/");
    const rest = segs.slice(upIdx + 1);
    if (rest.length === 0) return null;
    const last = rest[rest.length - 1];
    const dot = last.lastIndexOf(".");
    rest[rest.length - 1] = (dot > 0 ? last.slice(0, dot) : last) + ".jpg";
    return `${u.origin}/${head}/so_0,w_${width},q_auto,f_jpg/${rest.join("/")}`;
  } catch {
    return null;
  }
}

// public_id from a delivery URL (for Admin destroy calls).
// Works for plain delivery URLs; transformed URLs resolve to the same id
// because the id is always the last segment(s) without transformations.
export function publicIdFromUrl(deliveryUrl: string): string | null {
  if (!isCloudinaryUrl(deliveryUrl)) return null;
  try {
    const u = new URL(deliveryUrl);
    const segs = u.pathname.split("/").filter(Boolean);
    const upIdx = segs.indexOf("upload");
    if (upIdx < 0) return null;
    let rest = segs.slice(upIdx + 1);
    if (rest.length === 0) return null;
    // Strip transformation segments (contain ',') and version (v123…)
    // wherever they appear — the public_id is whatever remains.
    rest = rest.filter((s) => !s.includes(",") && !/^v\d+$/.test(s));
    if (rest.length === 0) return null;
    const last = rest[rest.length - 1];
    const dot = last.lastIndexOf(".");
    rest[rest.length - 1] = dot > 0 ? last.slice(0, dot) : last;
    return decodeURIComponent(rest.join("/"));
  } catch {
    return null;
  }
}
