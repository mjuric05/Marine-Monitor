import { getSession } from "@/lib/sessions";
import { PARAMS } from "@/config/thresholds";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) {
    return new Response("Bad Request", { status: 400 });
  }

  const session = getSession(id);
  if (!session) {
    return new Response("Not Found", { status: 404 });
  }

  const headers = [
    "id",
    "ts",
    "datetime",
    `rpm_${PARAMS.rpm.unit}`,
    `coolantTemp_${PARAMS.coolantTemp.unit}`,
    `oilPressure_${PARAMS.oilPressure.unit}`,
    "lat",
    "lng",
  ];

  const rows = session.measurements.map((m) => {
    const dt = new Date(m.ts).toISOString().replace("T", " ").slice(0, 19);
    return [
      m.id,
      m.ts,
      dt,
      m.rpm,
      m.coolantTemp.toFixed(1),
      m.oilPressure.toFixed(2),
      m.lat ?? "",
      m.lng ?? "",
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sesija-${id}.csv"`,
    },
  });
}
