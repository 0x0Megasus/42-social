import { NextResponse } from "next/server";

export function isMaintenanceMode(): boolean {
  return process.env.MAINTENANCE_MODE === "true";
}

export function maintenanceResponse() {
  return NextResponse.json(
    { error: "site under maintenance" },
    { status: 503 }
  );
}
