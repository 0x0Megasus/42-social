import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { userGames } from "@/lib/games-store";
import { GamesLobby } from "@/components/games-lobby";

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const active = await userGames(session.sub);
  return <GamesLobby active={active} meId={session.sub} />;
}
