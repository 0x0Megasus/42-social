"use client";

import { useEffect, useReducer } from "react";
import { cn } from "@/lib/utils";

export type Presence = { online: boolean; lastSeen: string | null };

const cache = new Map<string, Presence>();
const listeners = new Set<() => void>();
const wanted = new Set<string>();
let timer: ReturnType<typeof setInterval> | null = null;
let inflight = false;

function notify() {
  for (const fn of listeners) fn();
}

async function poll() {
  if (inflight || wanted.size === 0) return;
  inflight = true;
  try {
    const res = await fetch(
      `/api/presence?ids=${encodeURIComponent([...wanted].join(","))}`
    );
    if (res.ok) {
      const d = (await res.json()) as { status: Record<string, Presence> };
      for (const [id, st] of Object.entries(d.status)) cache.set(id, st);
      notify();
    }
  } catch {
  } finally {
    inflight = false;
  }
}

function ensureLoop() {
  if (timer !== null || typeof window === "undefined") return;
  timer = setInterval(poll, 15_000);
}

export function usePresence(userId: string | null | undefined): Presence | null {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!userId) return;
    wanted.add(userId);
    ensureLoop();
    listeners.add(force);
    if (!cache.has(userId)) void poll();
    else force();
    return () => {
      listeners.delete(force);
    };
  }, [userId]);
  return userId ? (cache.get(userId) ?? null) : null;
}

export function PresenceHeartbeat() {
  useEffect(() => {
    let alive = true;
    const KEY = "dm-tabs-open";
    const bump = (delta: number) => {
      try {
        const n = Math.max(
          0,
          (Number(window.localStorage.getItem(KEY)) || 0) + delta
        );
        window.localStorage.setItem(KEY, String(n));
        return n;
      } catch {
        return 1;
      }
    };
    bump(1);
    const beat = () => {
      if (alive) fetch("/api/presence", { method: "POST" }).catch(() => null);
    };
    beat();
    const t = setInterval(beat, 20_000);
    const onHide = () => {
      if (bump(-1) === 0) {
        try {
          navigator.sendBeacon("/api/presence/offline");
        } catch {
        }
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);
  return null;
}

export function StatusDot({
  online,
  size = 12,
}: {
  online: boolean | null | undefined;
  size?: number;
}) {
  if (online === null || online === undefined) return null;
  return (
    <span
      aria-label={online ? "Online" : "Offline"}
      title={online ? "Online" : "Offline"}
      className={cn(
        "absolute rounded-full ring-2 ring-white dark:ring-zinc-950",
        online ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
      )}
      style={{ width: size, height: size, right: 0, bottom: 0 }}
    />
  );
}

export function LiveDot({
  userId,
  initialOnline,
  size,
}: {
  userId: string;
  initialOnline: boolean | null;
  size?: number;
}) {
  const live = usePresence(userId);
  return (
    <StatusDot online={live ? live.online : initialOnline} size={size} />
  );
}

export function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return "Never active";
  const s = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000);
  if (s < 0) return "Active now";
  if (s < 60) return "Active now";
  if (s < 3600) {
    const m = Math.floor(s / 60);
    return `Last seen ${m}m ago`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    return `Last seen ${h}h ago`;
  }
  const d = new Date(lastSeen);
  return `Last seen ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function PresenceText({
  userId,
  initial,
}: {
  userId: string;
  initial: Presence;
}) {
  const live = usePresence(userId);
  const st = live ?? initial;
  if (st.online)
    return <span className="font-medium text-emerald-600">Active now</span>;
  return <span>{formatLastSeen(st.lastSeen)}</span>;
}
