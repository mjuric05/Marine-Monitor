import type { AlarmLevel } from "@/lib/types";

// Pragovi za parametre motora. Prilagodi konkretnom motoru.
// Za RPM i temperaturu visoke vrijednosti su loše (direction: "high").
// Za tlak ulja niske vrijednosti su loše (direction: "low").

export interface ParamConfig {
  key: "rpm" | "coolantTemp" | "oilPressure";
  label: string;
  unit: string;
  min: number; // donja granica skale indikatora
  max: number; // gornja granica skale indikatora
  warn: number;
  alarm: number;
  direction: "high" | "low";
  decimals: number;
}

export const PARAMS: Record<ParamConfig["key"], ParamConfig> = {
  rpm: {
    key: "rpm",
    label: "Broj okretaja",
    unit: "o/min",
    min: 0,
    max: 2500,
    warn: 2000,
    alarm: 2300,
    direction: "high",
    decimals: 0,
  },
  coolantTemp: {
    key: "coolantTemp",
    label: "Temp. rashladne tekućine",
    unit: "°C",
    min: 0,
    max: 120,
    warn: 90,
    alarm: 98,
    direction: "high",
    decimals: 1,
  },
  oilPressure: {
    key: "oilPressure",
    label: "Tlak ulja",
    unit: "bar",
    min: 0,
    max: 7,
    warn: 2.0,
    alarm: 1.5,
    direction: "low",
    decimals: 1,
  },
};

// Iznad ovog broja okretaja smatramo da motor radi (koristi se za sesije).
export const RUN_THRESHOLD_RPM = 300;

// Histereza (postotak raspona) da se izbjegne treperenje alarma.
const HYSTERESIS = 0.0; // pojednostavljeno: bez histereze na strani prikaza

export function evaluate(
  key: ParamConfig["key"],
  value: number,
  overrides?: { warn: number; alarm: number }
): AlarmLevel {
  const c = PARAMS[key];
  if (value == null || Number.isNaN(value)) return "OK";
  const warn = overrides?.warn ?? c.warn;
  const alarm = overrides?.alarm ?? c.alarm;
  if (c.direction === "high") {
    if (value >= alarm) return "ALARM";
    if (value >= warn) return "WARN";
    return "OK";
  } else {
    // low is bad (oil pressure) — samo dok motor radi ima smisla
    if (value <= alarm) return "ALARM";
    if (value <= warn) return "WARN";
    return "OK";
  }
}

export const LEVEL_COLOR: Record<AlarmLevel, string> = {
  OK: "var(--ok)",
  WARN: "var(--warn)",
  ALARM: "var(--alarm)",
};
