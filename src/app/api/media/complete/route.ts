import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  readPath,
  transactLeaf,
  updatePaths,
} from "@/lib/db";

// POST /api/media/complete { publicId, url, bytes, kind } -> { ok }
// Called right after a successful upload: books the bytes against the
// daily quota and clears the pending marker. The public_id must live
// under the caller's own prefix (the upload preset locks the folder too).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { publicId, bytes, kind } = (await req.json().catch(() => ({}))) as {
    publicId?: string;
    url?: string;
    bytes?: number;
    kind?: string;
  };
  if (
    typeof publicId !== "string" ||
    !publicId.startsWith(`42social/${session.sub}/`) ||
    typeof bytes !== "number" ||
    !(bytes > 0) ||
    (kind !== "image" && kind !== "video" && kind !== "voice")
  )
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  const day = new Date().toISOString().slice(0, 10);
  await transactLeaf(`/upload-usage/${session.sub}/${day}`, (cur) => {
    const u =
      cur && typeof cur === "object"
        ? (cur as { bytes?: number; count?: number })
        : {};
    return {
      bytes: (typeof u.bytes === "number" ? u.bytes : 0) + bytes,
      count: (typeof u.count === "number" ? u.count : 0) + 1,
    };
  }).catch(() => null);
  const pending = await readPath<Record<string, { publicId?: string }>>(
    `/upload-pending/${session.sub}`
  ).catch(() => null);
  if (pending && typeof pending === "object") {
    const hits = Object.entries(pending)
      .filter(([, v]) => v && v.publicId === publicId)
      .map(([key]) => [`/upload-pending/${session.sub}/${key}`, null]);
    if (hits.length > 0)
      await updatePaths(Object.fromEntries(hits)).catch(() => null);
  }
  return NextResponse.json({ ok: true });
}
