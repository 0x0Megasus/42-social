import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import {
  readPath,
  setPath,
  updatePaths,
} from "@/lib/db";
import { destroyAssets } from "@/lib/cloudinary-admin";

const DAILY_BYTES = 200 * 1024 * 1024;
const DAILY_UPLOADS = 200;
const PENDING_TTL_MS = 2 * 3600_000;

function ownPublicId(uid: string, publicId: string): boolean {
  return publicId.startsWith(`42social/${uid}/`);
}

async function sweepPending(uid: string): Promise<void> {
  const pending = await readPath<
    Record<string, { publicId?: string; at?: number }>
  >(`/upload-pending/${uid}`).catch(() => null);
  if (!pending || typeof pending !== "object") return;
  const now = Date.now();
  const stale: [string, string][] = [];
  for (const [key, v] of Object.entries(pending)) {
    if (
      v &&
      typeof v.publicId === "string" &&
      typeof v.at === "number" &&
      now - v.at > PENDING_TTL_MS
    ) {
      stale.push([key, v.publicId]);
    }
  }
  if (stale.length === 0) return;
  await destroyAssets(stale.map(([, id]) => id));
  await updatePaths(
    Object.fromEntries(stale.map(([key]) => [`/upload-pending/${uid}/${key}`, null]))
  ).catch(() => null);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lim = rateLimit(`media:${session.sub}`, 60, 60_000);
  if (!lim.ok)
    return NextResponse.json(
      { error: "limit", retryAfter: lim.retryAfter },
      { status: 429 }
    );
  const { kind, bytes, publicId } = (await req.json().catch(() => ({}))) as {
    kind?: string;
    bytes?: number;
    publicId?: string;
  };
  if (
    (kind !== "image" && kind !== "video" && kind !== "voice") ||
    typeof bytes !== "number" ||
    !(bytes > 0) ||
    typeof publicId !== "string" ||
    !ownPublicId(session.sub, publicId)
  )
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  await sweepPending(session.sub).catch(() => null);
  const day = new Date().toISOString().slice(0, 10);
  const usage = await readPath<{ bytes?: number; count?: number }>(
    `/upload-usage/${session.sub}/${day}`
  ).catch(() => null);
  const usedBytes = typeof usage?.bytes === "number" ? usage.bytes : 0;
  const usedCount = typeof usage?.count === "number" ? usage.count : 0;
  if (usedBytes + bytes > DAILY_BYTES || usedCount + 1 > DAILY_UPLOADS) {
    return NextResponse.json({ error: "daily-quota" }, { status: 429 });
  }
  await setPath(`/upload-pending/${session.sub}/${Date.now().toString(36)}`, {
    publicId,
    kind,
    at: Date.now(),
  }).catch(() => null);
  return NextResponse.json({ ok: true, remaining: DAILY_BYTES - usedBytes });
}
