import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/sessions";
import { fmtDateTime, fmtDuration, fmtNum, fmtCoord } from "@/lib/format";
import { getServerT } from "@/lib/locale";
import SessionNameEditor from "@/components/SessionNameEditor";
import SessionDetailTabs from "@/components/SessionDetailTabs";
import DeleteSessionButton from "@/components/DeleteSessionButton";

export const dynamic = "force-dynamic";

export default async function SessionDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const session = Number.isFinite(id) ? await getSession(id) : null;
  if (!session) notFound();

  const t = getServerT();
  const sd = t.sessionDetail;

  const track = session.measurements
    .filter((m) => m.lat != null && m.lng != null)
    .map((m) => ({ lat: m.lat as number, lng: m.lng as number }));

  const startPos =
    session.startLat != null && session.startLng != null
      ? { lat: session.startLat, lng: session.startLng }
      : (track[0] ?? null);

  const stats: [string, string][] = [
    [sd.statStart, fmtDateTime(session.startedAt)],
    [sd.statEnd, session.endedAt ? fmtDateTime(session.endedAt) : sd.statEndInProgress],
    [sd.statDuration, fmtDuration(session.durationSec)],
    [sd.statSamples, fmtNum(session.samples)],
    [sd.statMaxRpm, `${fmtNum(session.maxRpm)} o/min`],
    [sd.statAvgRpm, `${fmtNum(session.avgRpm)} o/min`],
    [sd.statMaxTemp, `${fmtNum(session.maxTemp, 1)} °C`],
    [sd.statMinOil, `${fmtNum(session.minOilPressure, 1)} bar`],
    [sd.statStartLoc, fmtCoord(session.startLat, session.startLng)],
  ];

  return (
    <div className="space-y-6">
      {/* Zaglavlje */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className="readout text-2xl font-semibold text-phosphor">#{session.id}</span>
            {session.endedAt == null ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-0.5 text-xs font-medium text-ok">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" />{sd.inProgress}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-line px-2.5 py-0.5 text-xs font-medium text-dim">
                <span className="h-1.5 w-1.5 rounded-full bg-dim" />{sd.closed}
              </span>
            )}
          </div>
          <SessionNameEditor sessionId={session.id} initialName={session.name} />
          <p className="label">{fmtDateTime(session.startedAt)}</p>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <DeleteSessionButton sessionId={session.id} redirectAfter />
          <a
            href={`/api/sessions/${session.id}/export`}
            download={`sesija-${session.id}.csv`}
            className="rounded-md border border-line px-3 py-1.5 text-sm text-dim transition hover:border-phosphor hover:text-phosphor"
          >
            {sd.csvExport}
          </a>
          <Link href="/sessions" className="rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:text-white">
            {sd.backToSessions}
          </Link>
        </div>
      </div>

      {/* Statistike */}
      <section className="panel panel-glow grid grid-cols-2 gap-x-8 gap-y-3 p-5 sm:grid-cols-3">
        {stats.map(([k, v]) => (
          <div key={k} className="border-b border-line pb-2">
            <div className="label">{k}</div>
            <div className="readout mt-0.5 text-base text-white">{v}</div>
          </div>
        ))}
      </section>

      {/* Tabovi */}
      <SessionDetailTabs session={session} track={track} startPos={startPos} />
    </div>
  );
}
