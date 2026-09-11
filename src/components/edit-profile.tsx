"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

export function EditProfileForm({
  name,
  bio,
}: {
  name: string;
  bio: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftBio, setDraftBio] = useState(bio);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (draftName.trim().length < 2) {
      setError("Name needs at least 2 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName.trim(), bio: draftBio.trim() }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(
          res.status === 429
            ? `Slow down — try again in ${d?.retryAfter ?? 10}s.`
            : (d?.error ?? "Couldn't save.")
        );
        return;
      }
      setEditing(false);
      toast.success("Profile updated");
      router.refresh();
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraftName(name);
          setDraftBio(bio);
          setEditing(true);
        }}
        className="mt-4 flex items-center gap-1.5 rounded-full border border-zinc-300 px-4 py-1.5 text-[13px] font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
      >
        <Pencil size={14} /> Edit profile
      </button>
    );
  }

  return (
    <form onSubmit={save} className="mx-auto mt-4 max-w-xs space-y-2 text-left">
      <div>
        <label htmlFor="edit-name" className="text-xs font-semibold text-zinc-500">
          Nickname
        </label>
        <input
          id="edit-name"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          maxLength={30}
          autoComplete="off"
          className="mt-1 h-10 w-full rounded-xl border border-zinc-200 bg-transparent px-3 text-[14px] outline-none focus:border-cyan-500 dark:border-zinc-700"
        />
        <p className="text-right text-[11px] text-zinc-400">
          {draftName.length}/30
        </p>
      </div>
      <div>
        <label htmlFor="edit-bio" className="text-xs font-semibold text-zinc-500">
          Bio
        </label>
        <textarea
          id="edit-bio"
          value={draftBio}
          onChange={(e) => setDraftBio(e.target.value)}
          maxLength={160}
          rows={2}
          placeholder="A line about you…"
          className="mt-1 w-full resize-none rounded-xl border border-zinc-200 bg-transparent px-3 py-2 text-[14px] outline-none focus:border-cyan-500 dark:border-zinc-700"
        />
        <p className="text-right text-[11px] text-zinc-400">
          {draftBio.length}/160
        </p>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-rose-600">
          {error}
        </p>
      )}
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-full border border-zinc-300 px-4 py-1.5 text-[13px] font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-zinc-900 px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
