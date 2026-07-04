import { NextResponse } from "next/server";
import { listSessions } from "@/lib/sessions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ sessions: listSessions(200) });
}
