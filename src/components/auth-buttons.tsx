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
  const [busy, setBusy] = useState<"42" | null>(null);
  const [config, setConfig] = useState<{
    fortyTwo: boolean;
  } | null>(null);

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d) => setConfig({ fortyTwo: d?.fortyTwo !== false }))
      .catch(() => setConfig({ fortyTwo: false }));
  }, []);

  return (
    <div className="space-y-3">
      {config && !config.fortyTwo && (
        <p
          role="alert"
          className="rounded-xl bg-amber-50 px-3 py-2 text-center text-[13px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
        >
          42 login isn&apos;t set up on this server yet — add FORTY_TWO_UID /
          FORTY_TWO_SECRET to .env.local.
        </p>
      )}
      <a
        href="/api/auth/42"
        onClick={() => setBusy("42")}
        aria-disabled={busy !== null || config?.fortyTwo === false}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FAFAFA] text-[14px] font-semibold text-[#18181B] hover:bg-[#E4E4E7] transition-opacity disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50"
      >
        {busy === "42" ? "Redirecting…" : "Continue with 42 Intra"}
      </a>
    </div>
  );
}
