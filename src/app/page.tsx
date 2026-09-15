import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cachedUserById, userPublic } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getFeedPage } from "@/lib/feed";
import { Feed } from "@/components/feed";

export const dynamic = "force-dynamic";

// Gated by middleware — session is guaranteed here.
export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  const [meUser, page] = await Promise.all([
    cachedUserById(session.sub),
    getFeedPage({ meId: session.sub, limit: 20 }),
  ]);
  const me = meUser ? userPublic(meUser) : null;

  return (
    <div className="space-y-4">
      <Suspense>
        <Feed initial={page.posts} initialHasMore={page.hasMore} me={me} />
      </Suspense>
    </div>
  );
}
