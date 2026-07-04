"use client";

import type { AlarmEvent, AlarmLevel } from "@/lib/types";
import { PARAMS } from "@/config/thresholds";
import { useLanguage } from "@/components/LanguageProvider";

const LEVEL_COLOR: Record<AlarmLevel, string> = {
  OK: "var(--ok)",
  WARN: "var(--warn)",
  ALARM: "var(--alarm)",
};

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

export default function AlarmLog({ events }: { events: AlarmEvent[] }) {
  const { t } = useLanguage();
  const lvl = t.alarm.levels;

  if (events.length === 0) {
    return (
      <div className="flex h-full min-h-[100px] items-center justify-center text-sm text-dim">
        {t.alarm.noEvents}
      </div>
    );
  }

  return (
    <ul className="max-h-[270px] space-y-1.5 overflow-y-auto pr-0.5">
      {events.slice(0, 25).map((e) => {
        const colorTo = LEVEL_COLOR[e.to];
        const colorFrom = LEVEL_COLOR[e.from];
        const paramLabel = t.params[e.parameter]?.label ?? e.parameter;
        return (
          <li
            key={e.id}
            className="flex items-start gap-2.5 rounded-lg border border-line/40 px-3 py-2 text-xs"
            style={{ background: `${colorTo}06` }}
          >
            <span
              className="readout mt-px w-8 flex-shrink-0 rounded border px-1 py-0.5 text-center text-[10px] font-semibold"
              style={{ color: colorTo, borderColor: `${colorTo}40` }}
            >
              {lvl[e.to]}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{paramLabel}</span>
                <span className="inline-flex items-center gap-1 text-[10px]">
                  <span style={{ color: colorFrom }}>{lvl[e.from]}</span>
                  <span className="text-dim">→</span>
                  <span style={{ color: colorTo }}>{lvl[e.to]}</span>
                </span>
              </div>
              <div className="readout mt-0.5" style={{ color: colorTo }}>
                {e.value.toFixed(PARAMS[e.parameter]?.decimals ?? 0)}{" "}
                {PARAMS[e.parameter]?.unit}
              </div>
            </div>
            <span className="label flex-shrink-0 text-[10px] text-dim/50">
              {timeAgo(e.ts)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
