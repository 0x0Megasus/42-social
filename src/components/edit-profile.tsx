"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { graphemeLen } from "@/lib/sanitize";

const PRESETS = ["GitHub", "LinkedIn", "Instagram", "X"] as const;

function iconFor(_label: string) {
  return Link2;
}

export function EditProfileForm({
  name,
  bio,
  socials: initialSocials = [],
}: {
  name: string;
  bio: string;
  socials?: { label: string; url: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftBio, setDraftBio] = useState(bio);
  const [draftSocials, setDraftSocials] = useState<{ label: string; url: string }[]>(
    initialSocials
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  function addSocial(preset: string) {
    const exists = draftSocials.some((s) => s.label.toLowerCase() === preset.toLowerCase());
    if (exists) {
      toast.error(`${preset} already added`);
      return;
    }
    if (draftSocials.length >= 4) {
      toast.error("Max 4 socials");
      return;
    }
    setDraftSocials([...draftSocials, { label: preset, url: "" }]);
  }

  function removeSocial(idx: number) {
    setDraftSocials(draftSocials.filter((_, i) => i !== idx));
  }

  function updateSocialUrl(idx: number, url: string) {
    setDraftSocials(draftSocials.map((s, i) => (i === idx ? { ...s, url } : s)));
  }

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
        body: JSON.stringify({ name: draftName.trim(), bio: draftBio.trim(), socials: draftSocials }),
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
          setDraftSocials(initialSocials);
          setEditing(true);
        }}
        className="mt-4 flex items-center gap-1.5 rounded-full border border-[#3F3F46] px-4 py-1.5 text-[13px] font-semibold text-zinc-700 dark:border-[#3F3F46] dark:text-zinc-200"
      >
        <Pencil size={14} /> Edit profile
      </button>
    );
  }

  return (
    <form onSubmit={save} className="mx-auto mt-4 max-w-xs space-y-3 text-left">
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
          className="mt-1 h-10 w-full rounded-[2px] border-[1px] border-[#27272A] bg-[#09090B] px-3 text-[14px] text-[#F4F4F5] placeholder:text-[#71717A] outline-none focus:border-[#52525B]"
        />
        <p className="text-right text-[11px] text-zinc-400">
          {graphemeLen(draftName)}/30
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
          className="mt-1 w-full resize-none rounded-[2px] border-[1px] border-[#27272A] bg-[#09090B] px-3 py-2 text-[14px] text-[#F4F4F5] placeholder:text-[#71717A] outline-none focus:border-[#52525B]"
        />
        <p className="text-right text-[11px] text-zinc-400">
          {graphemeLen(draftBio)}/160
        </p>
      </div>

      <div>
        <label className="text-xs font-semibold text-zinc-500">Social links</label>
        <div className="mt-1 space-y-2">
          {draftSocials.map((s, idx) => {
            const Icon = iconFor(s.label);
            return (
              <div key={idx} className="flex items-center gap-2">
                <span className="flex h-9 w-24 shrink-0 items-center justify-center rounded-xl border border-[#27272A] bg-[#09090B] text-zinc-300 px-2 text-xs font-semibold">
                  <Icon size={13} className="mr-1 opacity-70" />
                  {s.label}
                </span>
                <input
                  value={s.url}
                  onChange={(e) => updateSocialUrl(idx, e.target.value)}
                  placeholder="https://…"
                  className="h-9 min-w-0 flex-1 rounded-[2px] border-[1px] border-[#27272A] bg-[#09090B] px-3 text-[13px] text-[#F4F4F5] placeholder:text-[#71717A] outline-none focus:border-[#52525B]"
                />
                <button
                  type="button"
                  onClick={() => removeSocial(idx)}
                  aria-label={`Remove ${s.label}`}
                  className="rounded-full p-1.5 text-zinc-500 hover:bg-[#18181B] hover:text-[#F4F4F5]"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => {
            const added = draftSocials.some((s) => s.label.toLowerCase() === preset.toLowerCase());
            const Icon = iconFor(preset);
            return (
              <button
                key={preset}
                type="button"
                onClick={() => addSocial(preset)}
                disabled={added}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${
                  added
                    ? "cursor-not-allowed border-[#3F3F46] bg-zinc-800 text-zinc-500"
                    : "border-[#27272A] bg-[#09090B] text-zinc-300 hover:bg-[#18181B]"
                }`}
              >
                <Icon size={12} />
                {preset} {added ? "✓" : "+"}
              </button>
            );
          })}
        </div>
        <p className="mt-1 flex justify-between text-[11px] text-zinc-500">
          <span>One per platform, max 4. Paste full URL.</span>
          <span>{draftSocials.length}/4</span>
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
          className="rounded-[2px] border border-[#3F3F46] px-4 py-1.5 text-[13px] font-semibold text-[#E4E4E7] hover:bg-[#18181B]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-[2px] bg-[#FAFAFA] px-4 py-1.5 text-[13px] font-semibold text-[#18181B] hover:bg-[#E4E4E7] disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
