import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { Footer } from "@/components/footer";

export const metadata: Metadata = {
  title: `Privacy Policy — ${SITE.name}`,
  description: `How ${SITE.name} collects, uses and protects your data.`,
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-[15px] font-bold">{title}</h2>
      <div className="mt-1 space-y-2 text-[14px] leading-6 text-zinc-600 dark:text-zinc-300">
        {children}
      </div>
    </section>
  );
}

export default function Privacy() {
  return (
    <article className="space-y-4">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-[14px] leading-6 text-zinc-600 dark:text-zinc-300">
          {SITE.name} is a small student project run by {SITE.ownerName}.
          This policy describes in plain language what data the app
          collects, why, and what your rights are. Last updated: September
          2026.
        </p>
      </section>

      <Section title="1. Account data">
        <p>
          When you sign in with Google (via Firebase Authentication) the app
          receives your name, email address and profile picture. When you
          sign in with 42 Intra it additionally receives your 42 login,
          campus and coalition. Signing in with both methods on the same
          email links them to a single profile — nothing is shared between
          providers beyond matching that email.
        </p>
      </Section>

      <Section title="2. Content you create">
        <p>
          Everything you post is stored so the app can show it back to you
          and your peers: posts, comments, likes, follows, direct messages
          (including edits, replies and read receipts), game moves, rooms
          and win/loss records, notifications, and your nickname, bio and
          last-seen timestamp.
        </p>
        <p>
          Posts, comments, likes, follows and profiles are visible to every
          logged-in member. Direct messages are visible only to the two
          participants. Deleted posts and comments are removed from feeds;
          deleted DMs disappear for both sides.
        </p>
      </Section>

      <Section title="3. Technical data">
        <p>
          Login sessions live in an encrypted, httpOnly cookie that expires
          after 7 days — JavaScript on the page can never read it. Your
          sound preference is kept in your own browser (localStorage), never
          sent anywhere. The app makes no advertising or analytics calls and
          embeds no third-party trackers; the only external requests are to
          Google/Firebase for login and to 42 Intra when you use 42 login.
        </p>
      </Section>

      <Section title="4. Where data lives & who can touch it">
        <p>
          All data is stored in Firebase Realtime Database hosted in the EU
          (europe-west1). Direct access from browsers is fully denied at the
          database level — every read and write goes through this
          application&apos;s server, which checks that you are logged in and
          only lets you touch your own data (or public content) before
          anything reaches the database.
        </p>
      </Section>

      <Section title="5. Your rights & deletion">
        <p>
          You can edit your nickname and bio at any time from your profile,
          and delete your own posts, comments and messages. For a full
          account and data deletion, contact {SITE.ownerName} via{" "}
          <a
            href={SITE.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
          >
            Instagram
          </a>{" "}
          or{" "}
          <a
            href={SITE.intraUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
          >
            42 Intra
          </a>{" "}
          and everything tied to your account will be removed.
        </p>
      </Section>

      <Section title="6. Changes">
        <p>
          If this policy changes, the updated date at the top changes with
          it. Continued use of {SITE.name} after changes means you accept
          the new policy.
        </p>
      </Section>
      <Footer />
    </article>
  );
}
