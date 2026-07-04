import { NextResponse } from "next/server";
import { currentSnapshot, recentMeasurements } from "@/lib/sessions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Trenutno stanje + posljednjih N mjerenja (za inicijalno punjenje grafa).
export async function GET() {
  return NextResponse.json({
    snapshot: currentSnapshot(),
    recent: recentMeasurements(240),
  });
}
