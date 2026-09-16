"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";
import { SITE, profileUrl, type ProfileTarget } from "@/lib/site";
import { cn } from "@/lib/utils";

function InstagramMark({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

const KEY = "footer-profile-target";
const TARGET_EVENT = "footer-profile-target-change";

function FortyTwoMark({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="flex items-center justify-center rounded font-black"
      style={{ width: size + 4, height: size + 4, fontSize: size * 0.62 }}
    >
      42
    </span>
  );
}

function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function getTargetSnapshot(): ProfileTarget {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "instagram" || saved === "intra") return saved;
  } catch {
  }
  return "intra";
}

function getTargetServerSnapshot(): ProfileTarget {
  return "intra";
}

function subscribeTarget(onChange: () => void) {
  window.addEventListener(TARGET_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(TARGET_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function Footer() {
  const pathname = usePathname();
  const isDM = pathname.startsWith("/dm");
  const isMobile = useSyncExternalStore(
    subscribeResize,
    () => window.innerWidth < 640,
    () => false
  );
  const target = useSyncExternalStore(subscribeTarget, getTargetSnapshot, getTargetServerSnapshot);

  if (isDM && isMobile) return null;

  function pick(t: ProfileTarget) {
    try {
      window.localStorage.setItem(KEY, t);
      window.dispatchEvent(new Event(TARGET_EVENT));
    } catch {
    }
  }

  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-zinc-200/70 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-1.5 px-4 py-3 text-center sm:max-w-2xl">
        <p className="flex items-center gap-1.5 text-[13px] text-zinc-500">
          Made with
          <Heart size={13} className="fill-rose-500 text-rose-500" aria-label="love" />
          by{" "}
          <a
            href={profileUrl(target)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-zinc-800 hover:underline dark:text-zinc-100"
          >
            {SITE.ownerName}
          </a>
        </p>
        <div
          role="group"
          aria-label="Choose which profile the name links to"
          className="flex items-center rounded-full border border-zinc-200 p-0.5 dark:border-zinc-800"
        >
          {(
            [
              { id: "instagram", label: "Instagram", Icon: InstagramMark },
              { id: "intra", label: "42 intra", Icon: null },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => pick(id)}
              aria-pressed={target === id}
              title={`Link to ${label}`}
              className={cn(
                "flex h-7 items-center gap-1 rounded-full px-3 text-xs font-semibold transition-colors",
                target === id
                  ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                  : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              )}
            >
              {Icon ? <Icon size={13} /> : <FortyTwoMark size={12} />}
              {label}
            </button>
          ))}
        </div>
        <nav
          aria-label="Footer"
          className="flex items-center gap-4 text-xs text-zinc-400"
        >
          <Link href="/about" className="hover:text-zinc-700 hover:underline dark:hover:text-zinc-200">
            About
          </Link>
          <Link href="/privacy" className="hover:text-zinc-700 hover:underline dark:hover:text-zinc-200">
            Privacy
          </Link>
          <span aria-hidden>·</span>
          <span>© {year} {SITE.name}</span>
        </nav>
      </div>
    </footer>
  );
}
