import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cachedUserById, userPublic } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getFeedPage } from "@/lib/feed";
import { Feed } from "@/components/feed";
import { isMaintenanceMode } from "@/lib/maintenance";
import { isSupportUser } from "@/lib/support";

export const dynamic = "force-dynamic";

// Gated by middleware — session is guaranteed here.
export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  const meUser = await cachedUserById(session.sub);

  if (isMaintenanceMode() && !isSupportUser(meUser)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <h1 className="text-2xl font-bold">Site under maintenance</h1>
      </div>
    );
  }

  if (!meUser) redirect("/login");
  const [me, page] = await Promise.all([
    userPublic(meUser),
    getFeedPage({ meId: session.sub, limit: 20 }),
  ]);

  return (
    <div className="space-y-4">
      <Suspense>
        <Feed initial={page.posts} initialHasMore={page.hasMore} me={me} />
      </Suspense>
    </div>
  );
}
