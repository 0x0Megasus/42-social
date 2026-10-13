import { NextResponse } from "next/server";
import { isMaintenanceMode } from "@/lib/maintenance";

export async function GET() {
  return NextResponse.json({
    fortyTwo: Boolean(process.env.FORTY_TWO_UID),
    maintenance: isMaintenanceMode(),
  });
}
