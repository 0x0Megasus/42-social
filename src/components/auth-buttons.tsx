"use client";

import { useState } from "react";
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
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <a
        href="/api/auth/42"
        onClick={() => setBusy(true)}
        aria-disabled={busy}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FAFAFA] text-[14px] font-semibold text-[#18181B] hover:bg-[#E4E4E7] transition-opacity aria-disabled:pointer-events-none aria-disabled:opacity-50"
      >
        {busy ? "Redirecting…" : "Continue with 42 Intra"}
      </a>
    </div>
  );
}
