"use client";

import type { AlarmLevel, SessionDetail } from "@/lib/types";
import { PARAMS } from "@/config/thresholds";
import { fmtTime, fmtDuration } from "@/lib/format";
import { useLanguage } from "@/components/LanguageProvider";

type EntryType = "start" | "stop" | "warn" | "alarm" | "ok";

interface LogEntry {
  ts: number;
  type: EntryType;
  label: string;
  detail?: string;
}

const TYPE_COLOR: Record<EntryType, string> = {
  start: "var(--ok)", stop: "var(--dim)", warn: "var(--warn)", alarm: "var(--alarm)", ok: "var(--ok)",
};
const TYPE_ICON: Record<EntryType, string> = {
  start: "▶", stop: "■", warn: "!", alarm: "!!", ok: "✓",
};

function levelToType(level: AlarmLevel): EntryType {
  if (level === "ALARM") return "alarm";
  if (level === "WARN") return "warn";
  return "ok";
}

export default function SessionLogs({ session }: { session: SessionDetail }) {
  const { t } = useLanguage();
  const lg = t.logs;

  const entries: LogEntry[] = [];

  entries.push({
    ts: session.startedAt, type: "start", label: lg.engineStarted,
    detail: session.startLat != null ? `${session.startLat.toFixed(5)}, ${session.startLng?.toFixed(5)}` : undefined,
  });

  for (const ae of session.alarmEvents) {
    const param = PARAMS[ae.parameter];
    const paramLabel = t.params[ae.parameter]?.label ?? (param?.label ?? ae.parameter);
    const levelLabel = lg.levels[ae.to];
    entries.push({
      ts: ae.ts, type: levelToType(ae.to),
      label: `${paramLabel} — ${levelLabel}`,
      detail: `${ae.value.toFixed(param?.decimals ?? 0)} ${param?.unit ?? ""}`,
    });
  }

  if (session.endedAt) {
    entries.push({
      ts: session.endedAt, type: "stop", label: lg.engineStopped,
      detail: session.durationSec != null ? `${lg.durationLabel}: ${fmtDuration(session.durationSec)}` : undefined,
    });
  }

  entries.sort((a, b) => a.ts - b.ts);

  if (entries.length === 0) {
    return <div className="panel panel-glow p-8 text-center text-dim">{lg.noEvents}</div>;
  }

  const alarmCount = entries.filter((e) => e.type === "alarm").length;
  const warnCount = entries.filter((e) => e.type === "warn").length;

  return (
    <div className="panel panel-glow p-5">
      {(alarmCount > 0 || warnCount > 0) && (
        <div className="mb-4 flex gap-3 border-b border-line pb-4">
          {alarmCount > 0 && (
            <span className="readout rounded border border-alarm/30 bg-alarm/10 px-2.5 py-1 text-xs text-alarm">
              {alarmCount} {lg.alarmCount}{alarmCount === 1 ? "" : "a"}
            </span>
          )}
          {warnCount > 0 && (
            <span className="readout rounded border border-warn/30 bg-warn/10 px-2.5 py-1 text-xs text-warn">
              {warnCount} {lg.warnCount}{warnCount === 1 ? "" : "a"}
            </span>
          )}
        </div>
      )}
      <ul className="space-y-0">
        {entries.map((entry, i) => {
          const color = TYPE_COLOR[entry.type];
          return (
            <li key={i} className="flex gap-4">
              <div className="w-16 flex-shrink-0 pt-[3px]">
                <span className="readout text-xs text-dim">{fmtTime(entry.ts)}</span>
              </div>
              <div className="flex flex-col items-center">
                <div
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-[10px] font-bold"
                  style={{ borderColor: color, color, background: `${color}10`, boxShadow: entry.type === "alarm" ? `0 0 8px ${color}40` : undefined }}
                >
                  {TYPE_ICON[entry.type]}
                </div>
                {i < entries.length - 1 && (
                  <div className="w-px flex-1 my-1" style={{ background: "var(--line)", minHeight: 16 }} />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-4">
                <div className="readout text-sm font-medium" style={{ color: entry.type === "ok" || entry.type === "start" ? "#e8eef5" : color }}>
                  {entry.label}
                </div>
                {entry.detail && <div className="readout mt-0.5 text-xs text-dim">{entry.detail}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
