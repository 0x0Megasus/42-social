
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

export function thumbUrl(deliveryUrl: string, width = 320): string | null {
  if (!isCloudinaryUrl(deliveryUrl)) return null;
  try {
    const u = new URL(deliveryUrl);
    const segs = u.pathname.split("/").filter(Boolean);
    const upIdx = segs.indexOf("upload");
    if (upIdx < 0) return null;
    const head = segs.slice(0, upIdx + 1).join("/");
    const rest = segs.slice(upIdx + 1);
    const t = `w_${width},q_auto,f_auto`;
    const path = `${head}/${t}/${rest.join("/")}`;
    return `${u.origin}/${path}`;
  } catch {
    return null;
  }
}

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

export function publicIdFromUrl(deliveryUrl: string): string | null {
  if (!isCloudinaryUrl(deliveryUrl)) return null;
  try {
    const u = new URL(deliveryUrl);
    const segs = u.pathname.split("/").filter(Boolean);
    const upIdx = segs.indexOf("upload");
    if (upIdx < 0) return null;
    let rest = segs.slice(upIdx + 1);
    if (rest.length === 0) return null;
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
