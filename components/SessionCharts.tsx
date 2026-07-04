"use client";

import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { PARAMS } from "@/config/thresholds";
import { fmtTime } from "@/lib/format";
import type { Measurement } from "@/lib/types";

const SERIES = [
  { key: "rpm" as const, color: "#5fe6c9" },
  { key: "coolantTemp" as const, color: "#f5a623" },
  { key: "oilPressure" as const, color: "#7aa2ff" },
];

export default function SessionCharts({
  measurements,
}: {
  measurements: Measurement[];
}) {
  const chartData = measurements.map((m) => ({
    ts: m.ts,
    rpm: m.rpm,
    coolantTemp: m.coolantTemp,
    oilPressure: m.oilPressure,
  }));

  return (
    <div className="space-y-6">
      {SERIES.map(({ key, color }) => {
        const c = PARAMS[key];
        return (
          <div key={key} className="panel panel-glow p-5">
            <div className="mb-4 flex items-center gap-3">
              <span
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ background: color, boxShadow: `0 0 6px ${color}` }}
              />
              <span className="readout text-lg font-semibold text-white">
                {c.label}
              </span>
              <span className="readout ml-auto text-sm text-dim">{c.unit}</span>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="4 4"
                  stroke="#1c2530"
                  vertical={false}
                />
                <XAxis
                  dataKey="ts"
                  tickFormatter={(t) => fmtTime(t)}
                  tick={{
                    fill: "#7a8a9e",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  stroke="#26303f"
                  minTickGap={60}
                />
                <YAxis
                  domain={[c.min, c.max]}
                  tick={{
                    fill: "#7a8a9e",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                  stroke="#26303f"
                  width={48}
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
                  formatter={(v: number) => [
                    `${v.toFixed(c.decimals)} ${c.unit}`,
                    c.label,
                  ]}
                />
                <ReferenceLine
                  y={c.warn}
                  stroke="#f5a623"
                  strokeDasharray="6 4"
                  strokeOpacity={0.7}
                  label={{
                    value: "upozorenje",
                    fill: "#f5a623",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    position: "insideTopRight",
                  }}
                />
                <ReferenceLine
                  y={c.alarm}
                  stroke="#ff4d4d"
                  strokeDasharray="6 4"
                  strokeOpacity={0.7}
                  label={{
                    value: "alarm",
                    fill: "#ff4d4d",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    position: "insideTopRight",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}
