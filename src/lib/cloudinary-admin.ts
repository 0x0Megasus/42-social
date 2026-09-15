import { createHash } from "crypto";
import { publicIdFromUrl } from "@/lib/cloudinary";

// Server-side Cloudinary Admin (destroy only). Needs CLOUDINARY_API_KEY +
// CLOUDINARY_API_SECRET + NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME. All calls are
// best-effort — media cleanup must never fail the RTDB write it follows.

function credentials(): {
  cloud: string;
  key: string;
  secret: string;
} | null {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
  const key = process.env.CLOUDINARY_API_KEY ?? "";
  const secret = process.env.CLOUDINARY_API_SECRET ?? "";
  if (!cloud || !key || !secret) return null;
  return { cloud, key, secret };
}

function signature(publicId: string, timestamp: number, secret: string): string {
  // Admin destroy signature: sha1("public_id=…&timestamp=…{secret}").
  return createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${secret}`)
    .digest("hex");
}

// Destroy assets by public_id (plus URL fallback). resource can be
// "image" or "video" (audio lives under video in Cloudinary).
export async function destroyAssets(
  ids: (string | null | undefined)[]
): Promise<void> {
  const creds = credentials();
  if (!creds) return;
  const unique = new Set<string>();
  for (const id of ids) {
    if (typeof id === "string" && id) unique.add(id);
  }
  if (unique.size === 0) return;
  await Promise.all(
    [...unique].map(async (publicId) => {
      for (const resource of ["image", "video"] as const) {
        try {
          const timestamp = Math.floor(Date.now() / 1000);
          const params = new URLSearchParams({
            public_id: publicId,
            timestamp: String(timestamp),
            api_key: creds.key,
            signature: signature(publicId, timestamp, creds.secret),
          });
          const res = await fetch(
            `https://api.cloudinary.com/v1_1/${creds.cloud}/${resource}/destroy`,
            { method: "POST", body: params }
          );
          if (res.ok) {
            const d = (await res.json().catch(() => ({}))) as {
              result?: string;
            };
            // "ok" or "not found" both mean gone; "not found" under the
            // wrong resource type just falls through to the other.
            if (d.result === "ok" || d.result === "not found") return;
          }
        } catch {
          /* try other resource type, then give up quietly */
        }
      }
    })
  );
}

// Convenience: destroy whatever Cloudinary assets delivery URLs point at.
export async function destroyUrls(
  urls: (string | null | undefined)[]
): Promise<void> {
  await destroyAssets(urls.map((u) => (typeof u === "string" ? publicIdFromUrl(u) : null)));
}
