"use client";

import { useEffect, useState } from "react";
import type { UnitSystem } from "@/lib/units";

const STORAGE_KEY = "marine-unit-system";

export function useUnitSystem() {
  const [system, setSystem] = useState<UnitSystem>("metric");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "metric" || saved === "imperial") setSystem(saved);
    } catch {
      /* ignore */
    }
  }, []);

  function toggle() {
    setSystem((prev) => {
      const next: UnitSystem = prev === "metric" ? "imperial" : "metric";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return { system, toggle };
}
