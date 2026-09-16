"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function ClearButton() {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function deleteAll() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/notifications", { method: "DELETE" });
      if (!res.ok) throw new Error();
      setArmed(false);
      router.refresh();
    } catch {
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      disabled={busy}
      onClick={() => (armed ? deleteAll() : setArmed(true))}
      onBlur={() => setArmed(false)}
      className={cn(
        "text-xs font-medium transition-colors",
        armed
          ? "text-rose-500 hover:text-rose-600"
          : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
      )}
    >
      {armed ? "Confirm delete" : "Delete all"}
    </button>
  );
}
