"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Copy, Check, Flag, RotateCcw, Eye } from "lucide-react";
import { toast } from "sonner";
import { api, ApiTimeoutError } from "@/lib/api";
import { Avatar } from "@/components/post-card";
import { LiveDot } from "@/components/presence";
import type { BackroomsBoardPayload } from "@/components/backrooms-view";
import type { RunResult } from "@/lib/games/types";
import { TTTBoardView, C4BoardView } from "@/components/game-boards";
import {
  RPSBoardView,
  NumberBoardView,
  TwentyOneBoardView,
} from "@/components/party-boards";
import { ChessBoardView } from "@/components/chess-board";
import { GAME_LABEL, type GameView } from "@/lib/games/types";
import type { TTTBoard } from "@/lib/games/tictactoe";
import type { C4Board } from "@/lib/games/connectfour";
import type { RPSBoard } from "@/lib/games/rps";
import type { NumberBoard } from "@/lib/games/number";
import type { TwentyBoard } from "@/lib/games/twentyone";
import type { ChessBoard } from "@/lib/games/chess";
import {
  previewC4Move,
  previewChessMove,
  previewTttMove,
  previewTwentyOneStand,
} from "@/lib/games/optimistic";
import { playLose, playMove, playWin } from "@/lib/sound";
import { cn } from "@/lib/utils";

// Three.js must never enter the server bundle — client-only chunk.
const BackroomsView = dynamic(
  () => import("@/components/backrooms-view").then((m) => m.BackroomsView),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        aria-label="Loading Backrooms"
        className="flex aspect-video w-full items-center justify-center rounded-2xl bg-black text-[13px] tracking-[0.3em] text-amber-100/70 ring-1 ring-white/10"
      >
        NO-CLIPPING…
      </div>
    ),
  }
);

function roomSig(r: GameView): string {
  return JSON.stringify([
    r.board,
    r.status,
    r.winnerId,
    r.turn,
    r.round,
    r.guestId,
  ]);
}

export function GameRoom({ code, meId }: { code: string; meId: string }) {
  const router = useRouter();
  const [room, setRoom] = useState<GameView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [live, setLive] = useState(false);
  const [gone, setGone] = useState(false);
  const sigRef = useRef("");
  const inflightRef = useRef(false);
  const missingRef = useRef(0);

  const applyRoom = useCallback(
    (next: GameView, confirmed: boolean) => {
      const sig = roomSig(next);
      if (!confirmed && sigRef.current === sig) {
        return; // duplicate SSE event (reconnect replay) — skip
      }
      if (sigRef.current && sigRef.current !== sig) {
        // something changed: move sound, win/lose jingle
        if (next.status === "over") {
          if (next.winnerId === meId) playWin();
          else if (next.winnerId) playLose();
        } else if (next.turn === meId) {
          playMove();
        }
      }
      sigRef.current = sig;
      setRoom(next);
    },
    [meId]
  );

  const load = useCallback(async () => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    try {
      const res = await api(`/api/games/${code}`, { cache: "no-store" });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 404) {
        // Never auto-eject: a missing read can be transient while the room
        // still exists. Park on an inline panel, keep polling for recovery.
        missingRef.current += 1;
        if (missingRef.current >= 2) setGone(true);
        else setReconnecting(true);
        return;
      }
      if (!res.ok) {
        setReconnecting(true);
        return;
      }
      missingRef.current = 0;
      setReconnecting(false);
      setGone(false);
      const d = await res.json();
      applyRoom(d.room as GameView, true);
    } catch {
      // offline/timeout: keep board, flag the connection
      setReconnecting(true);
    } finally {
      inflightRef.current = false;
    }
  }, [applyRoom, code, router]);

  // SSE: the moment the opponent's move commits, RTDB pushes the room to us
  // (~50–200ms end-to-end vs the old 0–2s poll ceiling). EventSource
  // auto-reconnects; the 2s poll below remains as fallback + 404 sentinel.
  useEffect(() => {
    const es = new EventSource(`/api/games/${code}/stream`);
    es.addEventListener("room", (ev) => {
      setLive(true);
      setReconnecting(false);
      try {
        const next = JSON.parse((ev as MessageEvent).data) as GameView;
        applyRoom(next, true);
      } catch {
        /* malformed frame — poll will correct */
      }
    });
    es.onerror = () => {
      setLive(false);
    };
    es.onopen = () => {
      setLive(true);
    };
    return () => es.close();
  }, [applyRoom, code]);

  useEffect(() => {
    load().finally(() => setLoading(false));
    const t = setInterval(load, 2000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  async function act(path: string, body?: object) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api(`/api/games/${code}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(
          d?.error === "illegal move"
            ? "Illegal move."
            : d?.error === "room is full"
              ? "Room is full."
              : "Action failed."
        );
        await load();
        return;
      }
      const d = await res.json();
      if (d.room) applyRoom(d.room, true);
      if (d.deleted || d.left) router.push("/games");
    } catch (e) {
      toast.error(e instanceof ApiTimeoutError ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  // Optimistic move: preview the result locally, send to the server in the
  // background. An illegal preview never even hits the network; the very
  // next confirmed snapshot (SSE or POST response) replaces the preview.
  function moveOptimistic(
    body: object,
    preview: (() => GameView | null) | null
  ) {
    if (busy) return;
    if (preview) {
      const next = preview();
      if (!next) return; // illegal locally — don't round-trip
      const sig = roomSig(next);
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        setRoom(next);
      }
    }
    void act("move", body);
  }

  // Backrooms: transmit one finished run. No optimistic preview — the run
  // already happened locally; the POST settles the room (and the duel).
  async function submitRun(result: RunResult) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api(`/api/games/${code}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!res.ok) {
        toast.error("Couldn't transmit score — retry from rematch.");
        await load();
        return;
      }
      const d = await res.json();
      if (d.room) applyRoom(d.room, true);
    } catch (e) {
      toast.error(e instanceof ApiTimeoutError ? e.message : "Couldn't transmit score.");
    } finally {
      setBusy(false);
    }
  }

  function copyCode() {
    const text = `${window.location.origin}/games/${code}`;
    (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => toast.error("Copy failed.")
    );
  }

  if (loading || !room) {
    if (gone && !loading) {
      return (
        <div className="mx-auto mt-10 max-w-sm rounded-3xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-lg font-bold">Couldn&apos;t load room {code}</p>
          <p className="mt-1 text-[13px] text-zinc-500">
            Still trying in the background — it may reappear on its own.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => {
                missingRef.current = 0;
                setGone(false);
                load();
              }}
              className="rounded-full bg-zinc-900 px-5 py-2 text-[14px] font-semibold text-white dark:bg-zinc-50 dark:text-zinc-900"
            >
              Retry
            </button>
            <Link
              href="/games"
              className="rounded-full border border-zinc-300 px-5 py-2 text-[14px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              Arcade
            </Link>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-3" role="status" aria-label="Loading game">
        <div aria-hidden className="h-36 motion-safe:animate-pulse rounded-2xl border border-zinc-200 dark:border-zinc-800" />
        <div aria-hidden className="mx-auto aspect-square w-full max-w-sm motion-safe:animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      </div>
    );
  }

  const isSpectator = !room.myMark;
  const isBackrooms = room.kind === "backrooms";
  const brMode = room.mode ?? "solo";
  const brBoard = isBackrooms ? (room.board as BackroomsBoardPayload) : null;
  const opponent =
    room.opponentId === room.players.host?.id
      ? room.players.host
      : room.players.guest;
  const turnName = room.turn === meId ? "Your" : opponent?.name ? `${opponent.name}'s` : "Opponent's";
  const iRematch = !!room.rematch?.[meId];
  const otherRematch =
    room.opponentId != null && !!room.rematch?.[room.opponentId];

  function fmtTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/games"
          aria-label="Back to arcade"
          className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-lg font-bold tracking-tight">
            {GAME_LABEL[room.kind]}
          </h1>
          <button
            onClick={copyCode}
            className="flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            title="Copy invite link"
          >
            Room <span className="font-bold tracking-widest">{room.id}</span>
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        </div>
        <span className="ml-auto flex items-center gap-2">
          {reconnecting && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              Reconnecting…
            </span>
          )}
          {live && !reconnecting && (
            <span
              title="Live updates on"
              className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Live
            </span>
          )}
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-500 dark:bg-zinc-900">
            Round {room.round}
          </span>
        </span>
      </div>

      {/* players */}
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            { p: room.players.host, role: room.kind === "tictactoe" ? "plays X" : room.kind === "connectfour" ? "plays R" : room.kind === "chess" ? "White" : isBackrooms ? (brMode === "solo" ? "Solo run" : "Duelist") : "Host" },
            { p: room.players.guest, role: room.kind === "tictactoe" ? "plays O" : room.kind === "connectfour" ? "plays Y" : room.kind === "chess" ? "Black" : isBackrooms ? "Duelist" : "Challenger" },
          ] as const
        ).map(({ p, role }, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-2 rounded-2xl border p-2.5",
              room.status === "playing" &&
                ((i === 0 && room.turn === room.hostId) ||
                  (i === 1 && room.guestId && room.turn === room.guestId))
                ? "border-cyan-400 dark:border-cyan-600"
                : "border-zinc-200 dark:border-zinc-800"
            )}
          >
            {p ? (
              <>
                <span className="relative">
                  <Avatar name={p.name} src={p.avatar} size={32} />
                  <LiveDot userId={p.id} initialOnline={null} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">
                    {p.id === meId ? "You" : p.name}
                  </p>
                  <p className="text-[11px] text-zinc-500">{role}</p>
                </div>
              </>
            ) : (
              <>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
                  ?
                </span>
                <p className="text-[13px] text-zinc-400">
                  {isBackrooms && brMode === "solo"
                    ? "Solo — no opponent"
                    : "Waiting…"}
                </p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* status */}
      <div
        role="status"
        className="rounded-2xl border border-zinc-200 bg-white p-3 text-center text-[14px] font-semibold dark:border-zinc-800 dark:bg-zinc-950"
      >
        {isBackrooms && brBoard ? (
          <>
            {room.status === "waiting" && "Waiting for opponent — share the code."}
            {room.status === "playing" && !brBoard.submitted && brMode === "solo" &&
              "Survive 6 waves. Force the exit. 🟨"}
            {room.status === "playing" && !brBoard.submitted && brMode === "duel" &&
              (brBoard.oppSubmitted
                ? "Opponent finished — run yours. Same maze."
                : "Duel — same maze. Highest score wins.")}
            {room.status === "playing" && brBoard.submitted &&
              (brMode === "solo"
                ? "Run transmitted."
                : brBoard.oppSubmitted
                  ? "Both runs in — revealing…"
                  : "Run transmitted — opponent still in the maze.")}
            {room.status === "over" && brMode === "solo" && (
              brBoard.myScore?.won ? "You escaped. 🏆" : "The Backrooms took you."
            )}
            {room.status === "over" && brMode === "duel" && (
              room.winnerId === null
                ? "Dead heat — draw."
                : room.winnerId === meId
                  ? "Duel won. 🏆"
                  : `${opponent?.name ?? "Opponent"} takes the duel.`
            )}
          </>
        ) : (
          <>
            {room.status === "waiting" && "Waiting for opponent — share the code."}
            {room.status === "playing" &&
              (room.yourTurn ? "Your turn." : `${turnName} turn.`)}
            {room.status === "over" &&
              (room.winnerId === null
                ? "Draw."
                : room.winnerId === meId
                  ? "You win. 🏆"
                  : `${opponent?.name ?? "Opponent"} wins.`)}
          </>
        )}
        {isSpectator && room.status !== "waiting" && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-zinc-400">
            <Eye size={13} /> spectating
          </span>
        )}
      </div>

      {/* duel results (revealed when both runs are in) */}
      {isBackrooms && brBoard?.results && (
        <div
          aria-label="Duel results"
          className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800"
        >
          {(
            [
              { id: room.hostId, profile: room.players.host },
              ...(room.guestId
                ? [{ id: room.guestId, profile: room.players.guest }]
                : []),
            ] as const
          ).map(({ id, profile }) => {
            const r = (brBoard.results as Record<string, RunResult>)[id];
            if (!r) return null;
            const isWinner = room.winnerId === id;
            return (
              <div
                key={id}
                className={cn(
                  "flex items-center gap-3 bg-white px-4 py-2.5 dark:bg-zinc-950",
                  isWinner && "bg-amber-50 dark:bg-amber-950/30"
                )}
              >
                <Avatar name={profile?.name ?? "?"} src={profile?.avatar ?? null} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">
                    {id === meId ? "You" : (profile?.name ?? "?")}
                    {isWinner ? " 🏆" : ""}
                  </p>
                  <p className="font-mono text-[11px] text-zinc-500">
                    {r.score} pts · wave {r.wave}/6 · {r.kills} kills · {fmtTime(r.time)}{r.won ? " · ESCAPED" : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* board (backrooms uses the full column width for its 16:9 stage) */}
      <div className={cn("mx-auto w-full", isBackrooms ? "max-w-none" : "max-w-sm")}>
        {isBackrooms && brBoard ? (
          room.status === "waiting" ? (
            <div
              role="status"
              className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-black text-center dark:border-zinc-700"
            >
              <p className="text-[15px] font-bold text-stone-200">
                The maze opens when your opponent joins
              </p>
              <p className="max-w-[26rem] px-6 text-[13px] text-stone-400">
                Share the room code above — same maze, same waves, highest
                score takes the duel.
              </p>
            </div>
          ) : (
            <BackroomsView
              key={`${room.id}-r${room.round}-s${brBoard.seed}`}
              payload={brBoard}
              onSubmit={isSpectator ? () => undefined : submitRun}
            />
          )
        ) : room.kind === "tictactoe" ? (
          <TTTBoardView
            board={room.board as TTTBoard}
            winLine={(room.winLine as number[] | null) ?? null}
            interactive={room.yourTurn && !busy}
            onCell={(cell) =>
              moveOptimistic({ cell }, () => {
                const r = previewTttMove(
                  room.board as TTTBoard,
                  cell,
                  room.myMark as "X" | "O"
                );
                return r.ok
                  ? {
                      ...room,
                      board: r.board,
                      yourTurn: false,
                      turn: room.opponentId ?? room.turn,
                    }
                  : null;
              })
            }
          />
        ) : room.kind === "connectfour" ? (
          <C4BoardView
            board={room.board as C4Board}
            winLine={(room.winLine as [number, number][] | null) ?? null}
            interactive={room.yourTurn && !busy}
            onCol={(col) =>
              moveOptimistic(
                { col },
                () => {
                  const r = previewC4Move(
                    room.board as C4Board,
                    col,
                    room.myMark as "R" | "Y"
                  );
                  return r.ok
                    ? {
                        ...room,
                        board: r.board,
                        yourTurn: false,
                        turn: room.opponentId ?? room.turn,
                      }
                    : null;
                }
              )
            }
          />
        ) : room.kind === "rps" ? (
          <RPSBoardView
            board={room.board as RPSBoard}
            interactive={room.yourTurn && !busy}
            onPick={(pick) => moveOptimistic({ pick }, null)}
          />
        ) : room.kind === "number" ? (
          <NumberBoardView
            board={room.board as NumberBoard}
            interactive={room.yourTurn && !busy}
            onGuess={(n) => moveOptimistic({ guess: n }, null)}
          />
        ) : room.kind === "twentyone" ? (
          <TwentyOneBoardView
            board={room.board as TwentyBoard}
            meId={meId}
            opponentId={room.opponentId}
            interactive={room.yourTurn && !busy}
            onHit={() => moveOptimistic({ action: "hit" }, null)}
            onStand={() =>
              moveOptimistic(
                { action: "stand" },
                () => {
                  const b = room.board as TwentyBoard;
                  return {
                    ...room,
                    board: {
                      ...b,
                      stood: previewTwentyOneStand(
                        b.hands,
                        b.stood,
                        meId
                      ).stood,
                    },
                    yourTurn: false,
                    turn: room.opponentId ?? room.turn,
                  };
                }
              )
            }
          />
        ) : (
          <ChessBoardView
            board={room.board as ChessBoard}
            myColor={
              meId === room.hostId ? "w" : room.guestId === meId ? "b" : null
            }
            interactive={room.yourTurn && !busy}
            clock={(room.board as ChessBoard).clock ?? null}
            onFlag={() => {
              void act("flag");
            }}
            onMove={(from, to, promotion) =>
              moveOptimistic(
                { from, to, promotion },
                () => {
                  const r = previewChessMove(
                    room.board as ChessBoard,
                    from,
                    to,
                    promotion
                  );
                  return r.ok
                    ? {
                        ...room,
                        board: r.board,
                        yourTurn: false,
                        turn: room.opponentId ?? room.turn,
                      }
                    : null;
                }
              )
            }
          />
        )}
      </div>

      {/* actions */}
      <div className="flex items-center justify-center gap-2">
        {room.status === "waiting" && !room.myMark && room.hostId !== meId && (
          <button
            onClick={() => act("join")}
            disabled={busy}
            className="rounded-full bg-[#FAFAFA] px-6 py-2 text-[14px] font-semibold text-[#18181B] hover:bg-[#E4E4E7] disabled:opacity-50"
          >
            Join game
          </button>
        )}
        {room.status === "over" && room.myMark && (
          <button
            onClick={() => act("rematch")}
            disabled={busy || iRematch}
            className="flex items-center gap-1.5 rounded-full bg-[#FAFAFA] px-6 py-2 text-[14px] font-semibold text-[#18181B] hover:bg-[#E4E4E7] disabled:opacity-50"
          >
            <RotateCcw size={15} />
            {iRematch
              ? otherRematch
                ? "Starting…"
                : "Waiting…"
              : "Rematch"}
          </button>
        )}
        {room.myMark && (
          <button
            onClick={() => act("leave")}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-full border border-[#3F3F46] px-4 py-2 text-[13px] font-semibold text-[#E4E4E7] hover:bg-[#18181B] disabled:opacity-50"
          >
            <Flag size={14} />
            {room.status === "playing" ? "Forfeit" : "Leave"}
          </button>
        )}
      </div>
      {room.status === "over" && room.myMark && otherRematch && !iRematch && (
        <p className="text-center text-[13px] text-cyan-600">
          Opponent wants a rematch — hit Rematch.
        </p>
      )}
    </div>
  );
}
