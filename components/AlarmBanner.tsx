"use client";

import type { AlarmEvent } from "@/lib/types";
import { PARAMS } from "@/config/thresholds";
import { fmtTime } from "@/lib/format";
import { useLanguage } from "@/components/LanguageProvider";

export default function AlarmBanner({
  alarmEvents,
  engineRunning,
}: {
  alarmEvents: AlarmEvent[];
  engineRunning: boolean;
}) {
  const { t } = useLanguage();
  if (!engineRunning) return null;

  const activeAlarms: AlarmEvent[] = [];
  const seen = new Set<string>();
  for (const e of alarmEvents) {
    if (!seen.has(e.parameter)) {
      seen.add(e.parameter);
      if (e.to === "ALARM") activeAlarms.push(e);
    }
  }

  if (activeAlarms.length === 0) return null;

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-alarm px-5 py-3"
      style={{
        background: "rgba(255,77,77,0.07)",
        boxShadow: "0 0 0 1px rgba(255,77,77,0.2), 0 0 30px rgba(255,77,77,0.12)",
        animation: "alarm-pulse 2s ease-in-out infinite",
      }}
    >
      <span
        className="h-3 w-3 flex-shrink-0 rounded-full bg-alarm"
        style={{ boxShadow: "0 0 14px var(--alarm)", animation: "blink 0.8s steps(2,start) infinite" }}
      />
      <span className="readout text-sm font-bold tracking-widest text-alarm">
        {t.alarm.banner}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-1">
        {activeAlarms.map((e) => (
          <span key={e.parameter} className="readout text-sm">
            <span className="text-alarm/60">
              {t.alarm.levels.ALARM}:{" "}
            </span>
            <span className="text-alarm font-semibold">
              {e.value.toFixed(PARAMS[e.parameter]?.decimals ?? 0)}{" "}
              {PARAMS[e.parameter]?.unit}
            </span>
          </span>
        ))}
      </div>
      <span className="label flex-shrink-0 text-alarm/40">
        {fmtTime(activeAlarms[0]?.ts)}
      </span>
    </div>
  );
}
