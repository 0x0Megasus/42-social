import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { DmList } from "@/components/dm-list";

export const dynamic = "force-dynamic";

export default async function DmPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <DmList meId={session.sub} />;
}
