import { NextResponse } from "next/server";
import { isMaintenanceMode } from "@/lib/maintenance";

export async function GET() {
  return NextResponse.json({
    google: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    fortyTwo: Boolean(process.env.FORTY_TWO_UID),
    maintenance: isMaintenanceMode(),
  });
}
