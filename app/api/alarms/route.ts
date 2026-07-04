import { NextResponse } from "next/server";
import { recentAlarmEvents } from "@/lib/sessions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ events: await recentAlarmEvents(50) });
}
