import { NextResponse } from "next/server";
import { get42Config } from "@/lib/forty-two";

export async function GET() {
  const { clientId, clientSecret, redirectUri } = get42Config();
  return NextResponse.json({
    uidSet: clientId.length > 0,
    uidPrefix: clientId.slice(0, 12),
    secretLen: clientSecret.length,
    redirect: redirectUri,
    nodeEnv: process.env.NODE_ENV ?? null,
  });
}
