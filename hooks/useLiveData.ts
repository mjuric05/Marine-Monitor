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

export function useLiveData() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<LivePoint[]>([]);
  const [alarmEvents, setAlarmEvents] = useState<AlarmEvent[]>([]);
  const [connected, setConnected] = useState(false);

  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const mountedRef = useRef(true);

  // Inicijalno punjenje podataka iz baze.
  useEffect(() => {
    mountedRef.current = true;
    let active = true;

    fetch("/api/latest")
      .then((r) => r.json())
      .then((d: { snapshot: Snapshot; recent: Measurement[] }) => {
        if (!active) return;
        setSnapshot(d.snapshot);
        setHistory(
          d.recent.map((m) => ({
            ts: m.ts,
            rpm: m.rpm,
            coolantTemp: m.coolantTemp,
            oilPressure: m.oilPressure,
          }))
        );
      })
      .catch(() => {});

    fetch("/api/alarms")
      .then((r) => r.json())
      .then((d: { events: AlarmEvent[] }) => {
        if (!active) return;
        setAlarmEvents(d.events);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  // SSE pretplata s eksponencijalnim ponovnim spajanjem.
  useEffect(() => {
    function connect() {
      if (!mountedRef.current) return;

      const es = new EventSource("/api/stream");
      esRef.current = es;

      es.onopen = () => {
        if (!mountedRef.current) return;
        setConnected(true);
        retryCountRef.current = 0;
      };

      es.onerror = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        es.close();
        esRef.current = null;
        const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30_000);
        retryCountRef.current = Math.min(retryCountRef.current + 1, 6);
        retryTimerRef.current = setTimeout(connect, delay);
      };

      es.onmessage = (ev) => {
        if (!mountedRef.current) return;
        try {
          const snap: Snapshot = JSON.parse(ev.data);
          setSnapshot(snap);

          // Dodaj nove alarm događaje u log (newest-first).
          if (snap.recentAlarms && snap.recentAlarms.length > 0) {
            setAlarmEvents((prev) => {
              const ids = new Set(prev.map((e) => e.id));
              const fresh = snap.recentAlarms!.filter((e) => !ids.has(e.id));
              if (!fresh.length) return prev;
              return [...fresh, ...prev].slice(0, 50);
            });
          }

          if (snap.last) {
            const p: LivePoint = {
              ts: snap.last.ts,
              rpm: snap.last.rpm,
              coolantTemp: snap.last.coolantTemp,
              oilPressure: snap.last.oilPressure,
            };
            setHistory((h) => {
              if (h.length && h[h.length - 1].ts === p.ts) return h;
              const next = [...h, p];
              return next.length > MAX_POINTS
                ? next.slice(next.length - MAX_POINTS)
                : next;
            });
          }
        } catch {
          /* ignoriraj neispravne poruke */
        }
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      esRef.current?.close();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
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
