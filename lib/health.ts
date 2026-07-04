import { evaluate } from "@/config/thresholds";
import type { Measurement } from "@/lib/types";

export interface HealthScore {
  score: number; // 0–100
  status: "NOMINAL" | "WARNING" | "CRITICAL";
  label: string;
}

/**
 * Izračunava "zdravlje motora" kao broj od 0 do 100.
 * Svaki parametar u WARN stanju oduzima 10, ALARM stanju oduzima 30.
 * Label je uvijek na hrvatskom; prijevod na EN radi HealthScoreWidget via i18n.
 */
export function computeHealth(
  m: Measurement | null,
  engineRunning: boolean
): HealthScore {
  if (!m || !engineRunning) {
    return { score: 100, status: "NOMINAL", label: "" };
  }

  let score = 100;
  for (const key of ["rpm", "coolantTemp", "oilPressure"] as const) {
    const level = evaluate(key, m[key]);
    if (level === "ALARM") score -= 30;
    else if (level === "WARN") score -= 10;
  }
  score = Math.max(0, score);

  if (score >= 80) return { score, status: "NOMINAL", label: "" };
  if (score >= 50) return { score, status: "WARNING", label: "" };
  return { score, status: "CRITICAL", label: "" };
}
