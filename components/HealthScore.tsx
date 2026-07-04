"use client";

import { useLanguage } from "@/components/LanguageProvider";
import type { HealthScore } from "@/lib/health";

const STATUS_COLOR: Record<HealthScore["status"], string> = {
  NOMINAL: "var(--ok)",
  WARNING: "var(--warn)",
  CRITICAL: "var(--alarm)",
};

export default function HealthScoreWidget({ health }: { health: HealthScore }) {
  const { t } = useLanguage();
  const color = STATUS_COLOR[health.status];
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (health.score / 100) * circ;

  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 72 72" className="h-14 w-14 flex-shrink-0">
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
        <circle
          cx="36" cy="36" r={r}
          fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform="rotate(-90 36 36)"
          style={{ transition: "stroke-dasharray 0.6s ease, stroke 0.4s ease", filter: `drop-shadow(0 0 5px ${color})` }}
        />
        <text x="36" y="40" textAnchor="middle" className="readout" fontSize="15" fill="#ffffff">
          {health.score}
        </text>
      </svg>
      <div className="min-w-0">
        <div className="readout text-sm font-semibold tracking-wide" style={{ color }}>
          {t.health[health.status]}
        </div>
        <div className="label mt-0.5 truncate">{health.label}</div>
      </div>
    </div>
  );
}
