"use client";

import { useEffect, useRef, useState } from "react";
import type { AlarmEvent, Measurement, Snapshot } from "@/lib/types";

export interface LivePoint {
  ts: number;
  rpm: number;
  coolantTemp: number;
  oilPressure: number;
}

export type TrendDirection = "up" | "down" | "stable";

export interface Trends {
  rpm: TrendDirection;
  coolantTemp: TrendDirection;
  oilPressure: TrendDirection;
}

const MAX_POINTS = 240;
const TREND_WINDOW = 8;
const LATEST_POLL_MS = 1200;
const ALARMS_POLL_MS = 4000;

function getTrend(
  points: LivePoint[],
  key: "rpm" | "coolantTemp" | "oilPressure"
): TrendDirection {
  if (points.length < 4) return "stable";
  const recent = points.slice(-TREND_WINDOW);
  const half = Math.floor(recent.length / 2);
  const firstHalf = recent.slice(0, half);
  const lastHalf = recent.slice(-half);
  const avg = (arr: LivePoint[]) =>
    arr.reduce((s, p) => s + p[key], 0) / arr.length;
  const range =
    points.reduce((m, p) => Math.max(m, p[key]), 0) -
      points.reduce((m, p) => Math.min(m, p[key]), Infinity) || 1;
  const relDiff = (avg(lastHalf) - avg(firstHalf)) / range;
  if (relDiff > 0.04) return "up";
  if (relDiff < -0.04) return "down";
  return "stable";
}

// Nadzorna ploča na Vercelu (serverless) ne može držati otvorenu SSE vezu
// pošurenu iz procesa poslužitelja, pa umjesto push obavijesti koristimo
// periodičko dohvaćanje (/api/latest za stanje+graf, /api/alarms za log).
export function useLiveData() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<LivePoint[]>([]);
  const [alarmEvents, setAlarmEvents] = useState<AlarmEvent[]>([]);
  const [connected, setConnected] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    async function pollLatest() {
      try {
        const r = await fetch("/api/latest", { cache: "no-store" });
        if (!r.ok) throw new Error("bad status");
        const d: { snapshot: Snapshot; recent: Measurement[] } = await r.json();
        if (!mountedRef.current) return;
        setConnected(true);
        setSnapshot(d.snapshot);
        setHistory(
          d.recent.slice(-MAX_POINTS).map((m) => ({
            ts: m.ts,
            rpm: m.rpm,
            coolantTemp: m.coolantTemp,
            oilPressure: m.oilPressure,
          }))
        );
      } catch {
        if (mountedRef.current) setConnected(false);
      }
    }

    async function pollAlarms() {
      try {
        const r = await fetch("/api/alarms", { cache: "no-store" });
        if (!r.ok) return;
        const d: { events: AlarmEvent[] } = await r.json();
        if (mountedRef.current) setAlarmEvents(d.events);
      } catch {
        /* pokušat ćemo opet sljedeći ciklus */
      }
    }

    pollLatest();
    pollAlarms();
    const latestTimer = setInterval(pollLatest, LATEST_POLL_MS);
    const alarmsTimer = setInterval(pollAlarms, ALARMS_POLL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(latestTimer);
      clearInterval(alarmsTimer);
    };
  }, []);

  const fresh =
    snapshot?.updatedAt != null && Date.now() - snapshot.updatedAt < 5000;

  // Trendovi se računaju iz historije pri svakom renderu — O(TREND_WINDOW), zanemarivo.
  const trends: Trends = {
    rpm: getTrend(history, "rpm"),
    coolantTemp: getTrend(history, "coolantTemp"),
    oilPressure: getTrend(history, "oilPressure"),
  };

  return { snapshot, history, alarmEvents, connected, fresh, trends };
}
