import { NextResponse } from "next/server";
import { getSession, updateSessionName, deleteSession } from "@/lib/sessions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Neispravan id" }, { status: 400 });
  }
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Sesija nije pronađena" }, { status: 404 });
  }
  return NextResponse.json({ session });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Neispravan id" }, { status: 400 });
  }
  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Neispravan JSON" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : null;
  const ok = await updateSessionName(id, name);
  if (!ok) {
    return NextResponse.json({ error: "Sesija nije pronađena" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, name: name?.trim() || null });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Neispravan id" }, { status: 400 });
  }
  const ok = await deleteSession(id);
  if (!ok) {
    return NextResponse.json({ error: "Sesija nije pronađena" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
