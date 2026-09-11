"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";

export function MessageButton({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function open() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/dm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        toast.error("Couldn't open chat — user may be gone.");
        return;
      }
      const d = await res.json();
      router.push(`/dm/${d.id}`);
    } catch {
      toast.error("Couldn't open chat");
      setBusy(false);
    }
  }

  return (
    <button
      onClick={open}
      disabled={busy}
      className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-4 py-1.5 text-[13px] font-semibold text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200"
    >
      <MessageCircle size={15} />
      {busy ? "…" : "Message"}
    </button>
  );
}
