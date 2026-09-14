"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, Check, Flag, RotateCcw, Eye } from "lucide-react";
import { toast } from "sonner";
import { api, ApiTimeoutError } from "@/lib/api";
import { Avatar } from "@/components/post-card";
import { LiveDot } from "@/components/presence";
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
import { playLose, playMove, playWin } from "@/lib/sound";
import { cn } from "@/lib/utils";

export function GameRoom({ code, meId }: { code: string; meId: string }) {
  const router = useRouter();
  const [room, setRoom] = useState<GameView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [gone, setGone] = useState(false);
  const sigRef = useRef("");
  const inflightRef = useRef(false);
  const missingRef = useRef(0);

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
      const next = d.room as GameView;
      const sig = JSON.stringify([
        next.board,
        next.status,
        next.winnerId,
        next.turn,
        next.round,
        next.guestId,
      ]);
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
    } catch (e) {
      // offline/timeout: keep board, flag the connection
      setReconnecting(true);
    } finally {
      inflightRef.current = false;
    }
  }, [code, meId, router]);

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
      if (d.room) {
        setRoom(d.room);
        sigRef.current = JSON.stringify([
          d.room.board,
          d.room.status,
          d.room.winnerId,
          d.room.turn,
          d.room.round,
          d.room.guestId,
        ]);
      }
      if (d.deleted || d.left) router.push("/games");
    } catch (e) {
      toast.error(e instanceof ApiTimeoutError ? e.message : "Action failed.");
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
  const opponent =
    room.opponentId === room.players.host?.id
      ? room.players.host
      : room.players.guest;
  const turnName = room.turn === meId ? "Your" : opponent?.name ? `${opponent.name}'s` : "Opponent's";
  const iRematch = !!room.rematch?.[meId];
  const otherRematch =
    room.opponentId != null && !!room.rematch?.[room.opponentId];

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
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-500 dark:bg-zinc-900">
            Round {room.round}
          </span>
        </span>
      </div>

      {/* players */}
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            { p: room.players.host, role: room.kind === "tictactoe" ? "plays X" : room.kind === "connectfour" ? "plays R" : room.kind === "chess" ? "White" : "Host" },
            { p: room.players.guest, role: room.kind === "tictactoe" ? "plays O" : room.kind === "connectfour" ? "plays Y" : room.kind === "chess" ? "Black" : "Challenger" },
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
                <p className="text-[13px] text-zinc-400">Waiting…</p>
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
        {room.status === "waiting" && "Waiting for opponent — share the code."}
        {room.status === "playing" &&
          (room.yourTurn ? "Your turn." : `${turnName} turn.`)}
        {room.status === "over" &&
          (room.winnerId === null
            ? "Draw."
            : room.winnerId === meId
              ? "You win. 🏆"
              : `${opponent?.name ?? "Opponent"} wins.`)}
        {isSpectator && room.status !== "waiting" && (
          <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-zinc-400">
            <Eye size={13} /> spectating
          </span>
        )}
      </div>

      {/* board */}
      <div className="mx-auto w-full max-w-sm">
        {room.kind === "tictactoe" ? (
          <TTTBoardView
            board={room.board as TTTBoard}
            winLine={(room.winLine as number[] | null) ?? null}
            interactive={room.yourTurn && !busy}
            onCell={(cell) => act("move", { cell })}
          />
        ) : room.kind === "connectfour" ? (
          <C4BoardView
            board={room.board as C4Board}
            winLine={(room.winLine as [number, number][] | null) ?? null}
            interactive={room.yourTurn && !busy}
            onCol={(col) => act("move", { col })}
          />
        ) : room.kind === "rps" ? (
          <RPSBoardView
            board={room.board as RPSBoard}
            interactive={room.yourTurn && !busy}
            onPick={(pick) => act("move", { pick })}
          />
        ) : room.kind === "number" ? (
          <NumberBoardView
            board={room.board as NumberBoard}
            interactive={room.yourTurn && !busy}
            onGuess={(n) => act("move", { guess: n })}
          />
        ) : room.kind === "twentyone" ? (
          <TwentyOneBoardView
            board={room.board as TwentyBoard}
            meId={meId}
            opponentId={room.opponentId}
            interactive={room.yourTurn && !busy}
            onHit={() => act("move", { action: "hit" })}
            onStand={() => act("move", { action: "stand" })}
          />
        ) : (
          <ChessBoardView
            board={room.board as ChessBoard}
            myColor={
              meId === room.hostId ? "w" : room.guestId === meId ? "b" : null
            }
            interactive={room.yourTurn && !busy}
            onMove={(from, to, promotion) =>
              act("move", { from, to, promotion })
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
