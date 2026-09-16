import { createHash } from "crypto";
import { publicIdFromUrl } from "@/lib/cloudinary";


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
  return createHash("sha1")
    .update(`public_id=${publicId}&timestamp=${timestamp}${secret}`)
    .digest("hex");
}

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
            if (d.result === "ok" || d.result === "not found") return;
          }
        } catch {
        }
      }
    })
  );
}

export async function destroyUrls(
  urls: (string | null | undefined)[]
): Promise<void> {
  await destroyAssets(urls.map((u) => (typeof u === "string" ? publicIdFromUrl(u) : null)));
}
