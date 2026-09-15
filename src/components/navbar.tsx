"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Home, Compass, Bell, LogOut, Mail, Gamepad2 } from "lucide-react";
import { Avatar } from "@/components/post-card";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { playMessage, playNotification, unlockAudio } from "@/lib/sound";

type Me = {
  name: string;
  login42: string | null;
  avatar: string | null;
} | null;

export function Navbar() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me>(null);
  const [unread, setUnread] = useState(0);
  const [dmUnread, setDmUnread] = useState(0);
  const unreadRef = useRef(0);
  const dmRef = useRef(0);
  const firstBadge = useRef(true);

  useEffect(() => {
    // browsers gate audio behind a gesture — unlock on first interaction
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    api("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => null);
  }, [pathname]);

  useEffect(() => {
    if (!me) return;
    let stop = false;
    const loadBadges = async () => {
      try {
        const [n, d] = await Promise.all([
          api("/api/notifications").then((r) =>
            r.ok ? r.json() : null
          ),
          api("/api/dm").then((r) => (r.ok ? r.json() : null)),
        ]);
        if (stop) return;
        if (n) {
          const u = n.unread ?? 0;
          if (!firstBadge.current && u > unreadRef.current)
            playNotification();
          unreadRef.current = u;
          setUnread(u);
        }
        if (d) {
          const u = d.unread ?? 0;
          if (!firstBadge.current && u > dmRef.current) playMessage();
          dmRef.current = u;
          setDmUnread(u);
        }
        firstBadge.current = false;
      } catch {
        /* offline: keep old badges */
      }
    };
    loadBadges();
    const t = setInterval(loadBadges, 15_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [pathname, me]);

  const link = (href: string, label: string, Icon: typeof Home) => (
    <Link
      href={href}
      aria-label={label}
      aria-current={pathname === href ? "page" : undefined}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
        "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
        "dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
        pathname === href &&
          "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50"
      )}
    >
      <Icon size={19} strokeWidth={2} />
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/70">
      <nav className="mx-auto flex h-14 w-full max-w-xl items-center justify-between px-4 sm:max-w-2xl">
        <Link href="/" className="text-[15px] font-bold tracking-tight">
          42<span className="text-cyan-500">·</span>social
        </Link>
        <div className="flex items-center gap-1">
          {link("/", "Home", Home)}
          {link("/explore", "Explore", Compass)}
          {link("/games", "Arcade", Gamepad2)}
          <Link
            href="/dm"
            aria-label={`Messages${dmUnread > 0 ? `, ${dmUnread} unread` : ""}`}
            aria-current={pathname.startsWith("/dm") ? "page" : undefined}
            className={cn(
              "relative flex h-10 w-10 items-center justify-center rounded-full transition-colors",
              "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
              "dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
              pathname.startsWith("/dm") &&
                "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50"
            )}
          >
            <Mail size={19} strokeWidth={2} />
            {dmUnread > 0 && (
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-bold text-white"
              >
                {dmUnread > 9 ? "9+" : dmUnread}
              </span>
            )}
          </Link>
          <Link
            href="/notifications"
            aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
            aria-current={pathname === "/notifications" ? "page" : undefined}
            className={cn(
              "relative flex h-10 w-10 items-center justify-center rounded-full transition-colors",
              "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
              "dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
              pathname === "/notifications" &&
                "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50"
            )}
          >
            <Bell size={19} strokeWidth={2} />
            {unread > 0 && (
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-bold text-white"
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          {me ? (
            <>
              <Link
                href={`/profile/${encodeURIComponent(me.login42 ?? me.name)}`}
                aria-label="My profile"
                title="My profile"
                className={cn(
                  "ml-1 rounded-full p-0.5 transition-colors",
                  pathname.startsWith("/profile/")
                    ? "ring-2 ring-cyan-500"
                    : "hover:ring-2 hover:ring-zinc-300 dark:hover:ring-zinc-600"
                )}
              >
                <Avatar name={me.name} src={me.avatar} size={32} />
              </Link>
              <a
                href="/api/auth/logout"
                aria-label="Log out"
                onClick={() => {
                  // Clear the Firebase session too (the server only clears
                  // our cookie) so the next login starts clean.
                  void import("@/lib/firebase-client").then((m) =>
                    m.signOutFirebase().catch(() => null)
                  );
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
              >
                <LogOut size={19} strokeWidth={2} />
              </a>
            </>
          ) : (
            <Link
              href="/login"
              className="ml-1 rounded-full bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-80 dark:bg-zinc-50 dark:text-zinc-900"
            >
              Join
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
