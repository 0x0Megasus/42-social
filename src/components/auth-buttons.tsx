"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function FollowButton({
  userId,
  initial,
}: {
  userId: string;
  initial: boolean;
}) {
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        if (res.status === 429) {
          const d = await res.json().catch(() => ({}));
          toast.error(`Slow down — try again in ${d?.retryAfter ?? 10}s.`);
        } else {
          toast.error("Try again");
        }
        return;
      }
      const d = await res.json();
      setFollowing(d.following);
    } catch {
      toast.error("Try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      className={
        following
          ? "rounded-full border border-[#3F3F46] px-4 py-1.5 text-[13px] font-semibold text-[#E4E4E7]"
          : "rounded-full bg-[#FAFAFA] px-4 py-1.5 text-[13px] font-semibold text-[#18181B] hover:bg-[#E4E4E7]"
      }
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}

export function AuthButtons() {
  const [busy, setBusy] = useState<"google" | "42" | null>(null);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<{
    google: boolean;
    fortyTwo: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig({ google: false, fortyTwo: false }));
  }, []);

  async function google() {
    setError("");
    setBusy("google");
    try {
      const { signInWithGoogle } = await import("@/lib/firebase-client");
      const idToken = await signInWithGoogle();
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      const redirect =
        typeof d?.redirect === "string" && d.redirect.startsWith("/")
          ? d.redirect
          : "/";
      window.location.href = redirect;
    } catch (e) {
      if (!config?.google) {
        setError("Google login isn't set up on this server yet.");
      } else if (
        e instanceof Error &&
        e.message.includes("auth/popup-closed-by-user")
      ) {
        setError("Popup closed — try again.");
      } else if (
        e instanceof Error &&
        e.message.includes("auth/cancelled-popup-request")
      ) {
        setError("Already signing in — finish the open popup.");
      } else if (
        e instanceof Error &&
        e.message.includes("auth/operation-not-allowed")
      ) {
        setError("Google provider is off in Firebase Console — enable it.");
      } else {
        setError("Google sign-in failed. Try again.");
      }
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {config && !config.google && !config.fortyTwo && (
        <p
          role="alert"
          className="rounded-xl bg-amber-50 px-3 py-2 text-center text-[13px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
        >
          No login provider configured yet — add Firebase keys to .env.local.
        </p>
      )}
      <button
        onClick={google}
        disabled={busy !== null || config?.google === false}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white text-[14px] font-semibold transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      >
        <GIcon />
        {busy === "google" ? "Connecting…" : "Continue with Google"}
      </button>
      {config?.fortyTwo !== false && (
        <a
          href="/api/auth/42"
          onClick={() => setBusy("42")}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FAFAFA] text-[14px] font-semibold text-[#18181B] hover:bg-[#E4E4E7] transition-opacity disabled:opacity-50"
        >
          {busy === "42" ? "Redirecting…" : "Continue with 42 Intra"}
        </a>
      )}
      {error && (
        <p role="alert" className="text-center text-[13px] text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

function GIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c0 1.1-.7 2.7-2.1 3.6l-.1.4 3 2.3.2.1c1.9-1.8 3-4.4 3-8.6z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.4.1-3.1 2.4-.1.4c2 4 6.1 6.7 10.4 6.7z"
      />
      <path
        fill="#FBBC05"
        d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.4-3.1-2.4-.4.2C.6 8.9 0 10.4 0 12s.6 3.1 1.6 4.4l3.6-2z"
      />
      <path
        fill="#EA4335"
        d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.7 0 3.6 2.7 1.6 6.6l3.6 2.8c1-2.8 3.7-4.7 6.8-4.7z"
      />
    </svg>
  );
}
