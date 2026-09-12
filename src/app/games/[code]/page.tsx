import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { GameRoom } from "@/components/game-room";

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { code } = await params;
  return <GameRoom code={code.toUpperCase()} meId={session.sub} />;
}
