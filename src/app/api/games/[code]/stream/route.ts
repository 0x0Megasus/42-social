import { after } from "next/server";
import { buildView, getRoom } from "@/lib/games-store";
import { getSession } from "@/lib/session";
import { getRtdb } from "@/lib/fbrdb";
import type { GameRoom } from "@/lib/games/types";
import type { Database } from "firebase-admin/database";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getSession();
  if (!session)
    return new Response("unauthorized", { status: 401 });
  const { code } = await params;

  const room = await getRoom(code.toUpperCase());
  if (!room) return new Response("not found", { status: 404 });

  const meId = session.sub;
  const encoder = new TextEncoder();

  let ref: ReturnType<Database["ref"]> | null = null;
  let handler: ((snap: { val(): unknown }) => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: object | string) => {
        if (closed) return;
        try {
          const body =
            typeof payload === "string"
              ? `event: ping\ndata: ${payload}\n\n`
              : `event: room\ndata: ${JSON.stringify(payload)}\n\n`;
          controller.enqueue(encoder.encode(body));
        } catch {
        }
      };

      controller.enqueue(encoder.encode(":ok\n\n"));

      const initial = await buildView(room, meId);
      send(initial);

      handler = (snap) => {
        const raw = snap.val() as GameRoom | null;
        if (!raw) return; // deleted rooms keep the last board; poll handles 404s
        void buildView(raw, meId)
          .then(send)
          .catch(() => null);
      };
      ref = getRtdb().ref(`/games/${code.toUpperCase()}`);
      ref.on("value", handler as never);

      heartbeat = setInterval(() => send(String(Date.now())), 25_000);

      after(() => {
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (ref && handler) ref.off("value", handler as never);
      });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (ref && handler) ref.off("value", handler as never);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
