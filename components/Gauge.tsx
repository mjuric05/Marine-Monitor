"use client";

import type { ParamConfig } from "@/config/thresholds";
import { evaluate } from "@/config/thresholds";
import { fmtNum } from "@/lib/format";
import type { AlarmLevel } from "@/lib/types";
import type { TrendDirection } from "@/hooks/useLiveData";

const COLORS: Record<AlarmLevel, string> = {
  OK: "var(--ok)",
  WARN: "var(--warn)",
  ALARM: "var(--alarm)",
};

function trendColor(trend: TrendDirection, direction: "high" | "low"): string {
  const bad = direction === "high" ? "up" : "down";
  if (trend === "stable") return "var(--dim)";
  return trend === bad ? "var(--warn)" : "var(--ok)";
}

function TrendArrow({
  trend,
  direction,
}: {
  trend: TrendDirection;
  direction: "high" | "low";
}) {
  const char = trend === "up" ? "▲" : trend === "down" ? "▼" : "■";
  const color = trendColor(trend, direction);
  return (
    <text x="80" y="120" textAnchor="middle" fontSize="11" fill={color} opacity="0.85">
      {char}
    </text>
  );
}

export default function Gauge({
  config,
  value,
  displayValue,
  displayUnit,
  active,
  trend = "stable",
  thresholds,
}: {
  config: ParamConfig;
  /** Metričke vrijednosti — za poziciju luka i evaluaciju alarma. */
  value: number;
  /** Opcionalno: prikazna vrijednost u odabranom sustavu jedinica. */
  displayValue?: number;
  /** Opcionalno: oznaka jedinice za prikaz (npr. "°F", "PSI"). */
  displayUnit?: string;
  active: boolean;
  trend?: TrendDirection;
  thresholds?: { warn: number; alarm: number };
}) {
  const showValue = displayValue ?? value;
  const showUnit = displayUnit ?? config.unit;

  const level: AlarmLevel = active
    ? evaluate(config.key, value, thresholds)
    : "OK";
  const color = active ? COLORS[level] : "var(--dim)";
  const isAlarm = active && level === "ALARM";
  const isWarn = active && level === "WARN";

  const pct = Math.max(
    0,
    Math.min(1, (value - config.min) / (config.max - config.min))
  );

  const SWEEP = 270;
  const R = 64;
  const C = 80;
  const circ = (SWEEP / 360) * (2 * Math.PI * R);
  const dash = `${pct * circ} ${2 * Math.PI * R}`;

  const warn = thresholds?.warn ?? config.warn;
  const alarm = thresholds?.alarm ?? config.alarm;
  const warnPct = (warn - config.min) / (config.max - config.min);
  const alarmPct = (alarm - config.min) / (config.max - config.min);

  return (
    <div
      className="panel panel-glow scan flex flex-col items-center p-4 transition-shadow duration-500"
      style={
        isAlarm
          ? {
              borderColor: "rgba(255,77,77,0.45)",
              boxShadow: "0 0 0 1px rgba(255,77,77,0.2), 0 0 35px rgba(255,77,77,0.12)",
            }
          : isWarn
          ? {
              borderColor: "rgba(245,166,35,0.35)",
              boxShadow: "0 0 0 1px rgba(245,166,35,0.15), 0 0 25px rgba(245,166,35,0.08)",
            }
          : undefined
      }
    >
      <svg viewBox="0 0 160 160" className="h-44 w-44">
        <g transform="rotate(135 80 80)">
          {/* Pozadinski luk */}
          <circle
            cx={C} cy={C} r={R}
            fill="none" stroke="var(--line)" strokeWidth="10" strokeLinecap="round"
            strokeDasharray={`${circ} ${2 * Math.PI * R}`}
          />
          {/* Vrijednost — s CSS tranzicijom za glatko kretanje */}
          <circle
            cx={C} cy={C} r={R}
            fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={dash}
            style={{
              transition: "stroke-dasharray 0.5s ease, stroke 0.3s ease",
              filter: `drop-shadow(0 0 ${isAlarm ? 10 : 6}px ${color})`,
            }}
          />
          {/* Oznake pragova */}
          {[warnPct, alarmPct].map((p, i) => {
            const a = (p * SWEEP * Math.PI) / 180;
            const x1 = C + (R - 8) * Math.cos(a);
            const y1 = C + (R - 8) * Math.sin(a);
            const x2 = C + (R + 8) * Math.cos(a);
            const y2 = C + (R + 8) * Math.sin(a);
            return (
              <line
                key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={i === 0 ? "var(--warn)" : "var(--alarm)"}
                strokeWidth="2" opacity="0.7"
              />
            );
          })}
        </g>

        {/* Vrijednost u sredini */}
        <text
          x="80" y="74" textAnchor="middle"
          className="readout" fontSize="30" fill="#ffffff"
        >
          {fmtNum(showValue, config.decimals)}
        </text>
        <text
          x="80" y="96" textAnchor="middle"
          fontSize="11" fill="var(--dim)"
          fontFamily="var(--font-mono)" letterSpacing="2"
        >
          {showUnit.toUpperCase()}
        </text>

        {/* Trend strelica (samo dok motor radi i ima kretanja) */}
        {active && value > 0 && (
          <TrendArrow trend={trend} direction={config.direction} />
        )}
      </svg>

      <div className="mt-1 text-center">
        <div className="label">{config.label}</div>
        {active && level !== "OK" && (
          <div
            className="readout mt-1 inline-block rounded px-2 py-0.5 text-[11px] font-semibold"
            style={{
              color,
              border: `1px solid ${color}`,
              animation: isAlarm ? "alarm-pulse 1.5s ease-in-out infinite" : undefined,
            }}
          >
            {level === "WARN" ? "Upozorenje" : "⚠ Alarm"}
          </div>
        )}
      </div>
    </div>
  );
}
