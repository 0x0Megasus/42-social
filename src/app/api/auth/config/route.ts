import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    google: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    fortyTwo: Boolean(process.env.FORTY_TWO_UID),
  });
}
