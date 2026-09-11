"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ClearButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/notifications", { method: "POST" });
        setBusy(false);
        router.refresh();
      }}
      className="text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
    >
      Mark all read
    </button>
  );
}
