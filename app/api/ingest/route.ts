import { NextRequest, NextResponse } from "next/server";
import { ingest } from "@/lib/sessions";
import type { IngestPayload } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Prima jedno mjerenje od uređaja (Arduino/RPi) ili simulatora.
// Tijelo: { rpm, coolantTemp, oilPressure, lat?, lng?, deviceOn?, ts? }
export async function POST(req: NextRequest) {
  let body: IngestPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neispravan JSON" }, { status: 400 });
  }

  if (
    typeof body.rpm !== "number" ||
    typeof body.coolantTemp !== "number" ||
    typeof body.oilPressure !== "number"
  ) {
    return NextResponse.json(
      { error: "Obavezna polja: rpm, coolantTemp, oilPressure (brojevi)" },
      { status: 422 }
    );
  }

  const snap = ingest(body);
  return NextResponse.json({ ok: true, snapshot: snap });
}
