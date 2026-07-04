"use client";

import { useEffect, useState } from "react";
import { PARAMS } from "@/config/thresholds";

export interface ParamThresholds {
  warn: number;
  alarm: number;
}

export type CustomThresholds = {
  rpm: ParamThresholds;
  coolantTemp: ParamThresholds;
  oilPressure: ParamThresholds;
};

const DEFAULT: CustomThresholds = {
  rpm: { warn: PARAMS.rpm.warn, alarm: PARAMS.rpm.alarm },
  coolantTemp: { warn: PARAMS.coolantTemp.warn, alarm: PARAMS.coolantTemp.alarm },
  oilPressure: { warn: PARAMS.oilPressure.warn, alarm: PARAMS.oilPressure.alarm },
};

const STORAGE_KEY = "marine-thresholds-v1";

export function useThresholds() {
  const [thresholds, setThresholds] = useState<CustomThresholds>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as CustomThresholds;
        setThresholds(parsed);
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  function update(
    key: keyof CustomThresholds,
    field: "warn" | "alarm",
    rawValue: number
  ) {
    const param = PARAMS[key];
    const value = Math.max(param.min, Math.min(param.max, rawValue));

    setThresholds((prev) => {
      const next: CustomThresholds = {
        ...prev,
        [key]: { ...prev[key], [field]: value },
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function reset() {
    setThresholds(DEFAULT);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  function updateAll(next: CustomThresholds) {
    setThresholds(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  return { thresholds, update, updateAll, reset, hydrated };
}
