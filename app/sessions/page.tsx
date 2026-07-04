import Link from "next/link";
import { listSessions, sessionStats } from "@/lib/sessions";
import { fmtDateTime, fmtDuration, fmtNum } from "@/lib/format";
import { getServerT } from "@/lib/locale";
import DeleteSessionButton from "@/components/DeleteSessionButton";

export const dynamic = "force-dynamic";

function StatCard({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="panel panel-glow p-4">
      <div className="label">{label}</div>
      <div className="readout mt-1 text-2xl font-semibold" style={{ color: accent ? "var(--alarm)" : "#ffffff" }}>
        {value}
      </div>
      {sub && <div className="label mt-0.5 text-[10px] opacity-60">{sub}</div>}
    </div>
  );
}

export default async function SessionsPage() {
  const sessions = await listSessions(200);
  const stats = await sessionStats();
  const t = getServerT();
  const s = t.sessions;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="readout text-2xl font-semibold text-white">{s.title}</h1>
          <p className="label mt-1">{s.subtitle}</p>
        </div>
        <Link href="/" className="rounded-md border border-line px-3 py-1.5 text-sm text-dim hover:text-white">
          {s.backToLive}
        </Link>
      </div>

      {/* Statistike */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={s.statSessions} value={String(stats.totalSessions)} />
        <StatCard label={s.statHours} value={`${stats.totalEngineHours}h`} sub={s.totalHours} />
        <StatCard label={s.statAvg} value={stats.avgSessionDurationSec != null ? fmtDuration(stats.avgSessionDurationSec) : "—"} sub={s.perSession} />
        <StatCard label={s.statAlarms} value={String(stats.totalAlarms)} sub={s.alarmEvents} accent={stats.totalAlarms > 0} />
      </div>

      {sessions.length === 0 ? (
        <div className="panel panel-glow p-8 text-center text-dim">
          {s.noSessions}
          <div className="mt-2 font-mono text-xs">npm run simulate</div>
        </div>
      ) : (
        <div className="panel panel-glow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {["#", s.colStatus, s.colStart, s.colDuration, s.colSamples, s.colMaxRpm, s.colAvgRpm, s.colMaxTemp, s.colMinOil, ""].map((h) => (
                    <th key={h} className="label px-4 py-3 font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((sess) => (
                  <tr key={sess.id} className="border-b border-line/60 transition hover:bg-panel2">
                    <td className="px-4 py-3">
                      <div className="readout font-semibold text-phosphor">#{sess.id}</div>
                      {sess.name && <div className="mt-0.5 max-w-[140px] truncate text-xs text-white/70">{sess.name}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {sess.endedAt == null ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-0.5 text-xs font-medium text-ok">
                          <span className="h-1.5 w-1.5 rounded-full bg-ok" />{s.inProgress}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-line px-2.5 py-0.5 text-xs font-medium text-dim">
                          <span className="h-1.5 w-1.5 rounded-full bg-dim" />{s.closed}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white">{fmtDateTime(sess.startedAt)}</td>
                    <td className="readout px-4 py-3">
                      {sess.endedAt == null ? <span className="text-dim">—</span> : fmtDuration(sess.durationSec)}
                    </td>
                    <td className="readout px-4 py-3 text-dim">{fmtNum(sess.samples)}</td>
                    <td className="readout px-4 py-3">{fmtNum(sess.maxRpm)}</td>
                    <td className="readout px-4 py-3 text-dim">{fmtNum(sess.avgRpm)}</td>
                    <td className="readout px-4 py-3">{fmtNum(sess.maxTemp, 1)}</td>
                    <td className="readout px-4 py-3">{fmtNum(sess.minOilPressure, 1)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/sessions/${sess.id}`}
                          className="rounded border border-line px-2.5 py-1 text-xs text-dim hover:border-phosphor hover:text-phosphor"
                        >
                          {s.details}
                        </Link>
                        <DeleteSessionButton sessionId={sess.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
