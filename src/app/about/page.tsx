import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: `About — ${SITE.name}`,
  description: `What ${SITE.name} is and how it works.`,
};

const FEATURES = [
  {
    title: "Smart feed",
    body: "Posts rank by a real algorithm — engagement gravity with time decay, a boost for people you follow, and no same-author runs — with a Top/New switch. Your post appears instantly and counts update live.",
  },
  {
    title: "Direct messages",
    body: "1:1 chats with read receipts, edit/delete, quote-replies, emoji, typing-fast polling, online dots and last-seen. Find anyone from Messages → New chat, Explore, or their profile.",
  },
  {
    title: "Arcade",
    body: "Challenge friends with a 6-letter room code: Tic-Tac-Toe and Connect Four, server-validated moves (no cheating), rematches with alternating starter, spectators, and W/L/D records on profiles.",
  },
  {
    title: "Profiles & notifications",
    body: "42-enriched profiles (avatar, campus, coalition), editable nickname and bio, follow graph, and notifications that deep-link straight to the post — even if it was deleted, you'll be told so honestly.",
  },
];

export default function About() {
  return (
    <article className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-bold tracking-tight">
          About {SITE.name}
        </h1>
        <p className="mt-2 text-[14px] leading-6 text-zinc-600 dark:text-zinc-300">
          {SITE.name} is a minimal, fast campus network for 42 and 1337
          students. One account, two ways in — Google or 42 Intra (same
          email, same profile) — then a feed, DMs, and a game arcade shared
          with your peers. No ads, no tracking scripts, no noise.
        </p>
        <p className="mt-2 text-[14px] leading-6 text-zinc-600 dark:text-zinc-300">
          Built and maintained by{" "}
          <a
            href={SITE.intraUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
          >
            {SITE.ownerName}
          </a>
          , 42 student, with Next.js, Tailwind CSS and Firebase (Auth +
          Realtime Database hosted in the EU).
        </p>
      </section>

      {FEATURES.map((f) => (
        <section
          key={f.title}
          className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <h2 className="text-[15px] font-bold">{f.title}</h2>
          <p className="mt-1 text-[14px] leading-6 text-zinc-600 dark:text-zinc-300">
            {f.body}
          </p>
        </section>
      ))}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-[15px] font-bold">House rules</h2>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px] leading-6 text-zinc-600 dark:text-zinc-300">
          <li>You can edit your posts, comments and messages; deletes are final.</li>
          <li>Spam is rate-limited — flooding gets you slowed down, not banned.</li>
          <li>Be a good peer: no harassment, no cheating in the arcade.</li>
        </ul>
        <p className="mt-3 text-[14px]">
          <Link href="/" className="font-semibold underline">
            Back to the feed
          </Link>
        </p>
      </section>
    </article>
  );
}
