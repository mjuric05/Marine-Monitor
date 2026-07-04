"use client";

import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PARAMS } from "@/config/thresholds";
import type { LivePoint } from "@/hooks/useLiveData";
import type { CustomThresholds } from "@/hooks/useThresholds";
import { fmtTime } from "@/lib/format";

const SERIES = [
  { key: "rpm" as const, color: "#5fe6c9" },
  { key: "coolantTemp" as const, color: "#f5a623" },
  { key: "oilPressure" as const, color: "#7aa2ff" },
];

function Chart({
  data,
  paramKey,
  color,
  customWarn,
  customAlarm,
}: {
  data: LivePoint[];
  paramKey: "rpm" | "coolantTemp" | "oilPressure";
  color: string;
  customWarn?: number;
  customAlarm?: number;
}) {
  const c = PARAMS[paramKey];
  const warnVal = customWarn ?? c.warn;
  const alarmVal = customAlarm ?? c.alarm;

  return (
    <div className="panel panel-glow p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="label">{c.label}</span>
        <span className="readout text-xs text-dim">{c.unit}</span>
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <XAxis
            dataKey="ts"
            tickFormatter={(t) => fmtTime(t)}
            tick={{ fill: "#7a8a9e", fontSize: 10, fontFamily: "var(--font-mono)" }}
            stroke="#26303f"
            minTickGap={48}
          />
          <YAxis
            domain={[c.min, c.max]}
            tick={{ fill: "#7a8a9e", fontSize: 10, fontFamily: "var(--font-mono)" }}
            stroke="#26303f"
            width={42}
          />
          <Tooltip
            contentStyle={{
              background: "#0b1118",
              border: "1px solid #26303f",
              borderRadius: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
            }}
            labelFormatter={(t) => fmtTime(Number(t))}
            formatter={(v: number) => [v.toFixed(c.decimals), c.label]}
          />
          <ReferenceLine
            y={warnVal}
            stroke="#f5a623"
            strokeDasharray="4 4"
            strokeOpacity={0.7}
            label={{ value: `UPZ ${warnVal}`, fill: "#f5a623", fontSize: 9, fontFamily: "var(--font-mono)" }}
          />
          <ReferenceLine
            y={alarmVal}
            stroke="#ff4d4d"
            strokeDasharray="4 4"
            strokeOpacity={0.7}
            label={{ value: `ALM ${alarmVal}`, fill: "#ff4d4d", fontSize: 9, fontFamily: "var(--font-mono)" }}
          />
          <Line
            type="monotone"
            dataKey={paramKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function LiveCharts({
  data,
  thresholds,
}: {
  data: LivePoint[];
  thresholds?: CustomThresholds;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {SERIES.map((s) => (
        <Chart
          key={s.key}
          data={data}
          paramKey={s.key}
          color={s.color}
          customWarn={thresholds?.[s.key].warn}
          customAlarm={thresholds?.[s.key].alarm}
        />
      ))}
    </div>
  );
}
