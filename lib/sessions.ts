import { data, markDirty, nextId, getAlarmState, resetAlarmState } from "@/lib/db";
import { publish } from "@/lib/bus";
import { RUN_THRESHOLD_RPM, evaluate } from "@/config/thresholds";
import { ENGINE_STOP_GRACE_MS, DEVICE_STALE_MS } from "@/config/engine";
import type {
  AlarmEvent,
  IngestPayload,
  Measurement,
  Session,
  SessionDetail,
  Snapshot,
} from "@/lib/types";

/**
 * Obrađuje jedno dolazno mjerenje.
 *
 * Grace period (20 s): ako RPM padne ispod praga, sesija se NE zatvara odmah.
 * Tek kada 20 s prođe bez oporavka, sesija se zatvara i gaugeovi se resetiraju.
 * Ako RPM poraste unutar 20 s, grace period se poništava i sesija nastavlja.
 */
export function ingest(payload: IngestPayload): Snapshot {
  const ts = payload.ts ?? Date.now();
  const rpm = Number(payload.rpm) || 0;
  const coolantTemp = Number(payload.coolantTemp) || 0;
  const oilPressure = Number(payload.oilPressure) || 0;
  const lat = payload.lat ?? null;
  const lng = payload.lng ?? null;
  const deviceOn = payload.deviceOn ?? true;

  const running = rpm > RUN_THRESHOLD_RPM;
  let openId = data.device.openSessionId;
  let stoppingAt = data.device.engineStoppingAt ?? null;

  // ── Motor radi ────────────────────────────────────────────────────────────
  if (running) {
    // Poništi grace period ako je bio aktivan (motor se oporavio).
    if (stoppingAt != null) {
      data.device.engineStoppingAt = null;
      stoppingAt = null;
    }
    // Otvori novu sesiju ako je nema.
    if (openId == null) {
      const s: Session = {
        id: nextId("session"),
        startedAt: ts,
        endedAt: null,
        durationSec: null,
        samples: 0,
        maxRpm: null,
        avgRpm: null,
        maxTemp: null,
        minOilPressure: null,
        startLat: lat,
        startLng: lng,
        endLat: null,
        endLng: null,
      };
      data.sessions.push(s);
      openId = s.id;
    }
  }

  // Spremi mjerenje (uvijek, neovisno o stanju).
  const m: Measurement = {
    id: nextId("measurement"),
    sessionId: openId,
    ts,
    rpm,
    coolantTemp,
    oilPressure,
    lat,
    lng,
  };
  data.measurements.push(m);

  // Prati alarm tranzicije samo dok motor stvarno radi.
  const newAlarmEvents: AlarmEvent[] = [];
  if (running) {
    const alarmState = getAlarmState();
    for (const key of ["rpm", "coolantTemp", "oilPressure"] as const) {
      const newLevel = evaluate(key, m[key]);
      const prevLevel = alarmState[key] ?? "OK";
      if (newLevel !== prevLevel) {
        const ae: AlarmEvent = {
          id: nextId("alarmEvent"),
          ts,
          sessionId: openId,
          parameter: key,
          from: prevLevel,
          to: newLevel,
          value: m[key],
        };
        data.alarmEvents.push(ae);
        newAlarmEvents.push(ae);
        alarmState[key] = newLevel;
      }
    }
  }

  // ── Motor ne radi, sesija je otvorena ────────────────────────────────────
  if (!running && openId != null) {
    if (stoppingAt == null) {
      // RPM tek pao — pokreni grace period.
      data.device.engineStoppingAt = ts;
      stoppingAt = ts;
    } else if (ts - stoppingAt >= ENGINE_STOP_GRACE_MS) {
      // Grace period istekao → zatvori sesiju.

      // Emitiraj alarm-reset događaje za sve aktivne alarme.
      const alarmState = getAlarmState();
      for (const key of ["rpm", "coolantTemp", "oilPressure"] as const) {
        if (alarmState[key] !== "OK") {
          const ae: AlarmEvent = {
            id: nextId("alarmEvent"),
            ts,
            sessionId: openId,
            parameter: key,
            from: alarmState[key],
            to: "OK",
            value: m[key],
          };
          data.alarmEvents.push(ae);
          newAlarmEvents.push(ae);
        }
      }
      resetAlarmState();

      const s = data.sessions.find((x) => x.id === openId);
      if (s) {
        s.endedAt = ts;
        s.durationSec = Math.round((ts - s.startedAt) / 1000);
        s.endLat = lat;
        s.endLng = lng;
        const ms = data.measurements.filter((x) => x.sessionId === s.id);
        if (ms.length > 0) {
          let maxRpm = -Infinity, sumRpm = 0, maxTemp = -Infinity, minOil = Infinity;
          for (const x of ms) {
            maxRpm = Math.max(maxRpm, x.rpm);
            sumRpm += x.rpm;
            maxTemp = Math.max(maxTemp, x.coolantTemp);
            minOil = Math.min(minOil, x.oilPressure);
          }
          s.samples = ms.length;
          s.maxRpm = Math.round(maxRpm);
          s.avgRpm = Math.round(sumRpm / ms.length);
          s.maxTemp = +maxTemp.toFixed(1);
          s.minOilPressure = +minOil.toFixed(2);
        }
      }

      data.device.engineStoppingAt = null;
      stoppingAt = null;
      openId = null;
    }
    // Između: grace period još traje — ne radi ništa posebno.
  }

  data.device.deviceOn = deviceOn;
  data.device.openSessionId = openId;
  data.device.updatedAt = ts;
  markDirty();

  const sessionStartedAt =
    openId != null
      ? (data.sessions.find((s) => s.id === openId)?.startedAt ?? null)
      : null;

  const snap: Snapshot = {
    deviceOn,
    engineRunning: running,
    engineStoppingAt: stoppingAt,
    sessionId: openId,
    sessionStartedAt,
    last: m,
    updatedAt: ts,
    recentAlarms: newAlarmEvents.length > 0 ? newAlarmEvents : undefined,
  };
  publish(snap);
  return snap;
}

export function currentSnapshot(): Snapshot {
  const last = data.measurements[data.measurements.length - 1] ?? null;
  const openId = data.device.openSessionId;
  const stoppingAt = data.device.engineStoppingAt ?? null;
  const sessionStartedAt =
    openId != null
      ? (data.sessions.find((s) => s.id === openId)?.startedAt ?? null)
      : null;
  return {
    deviceOn: data.device.deviceOn,
    engineRunning: (last?.rpm ?? 0) > RUN_THRESHOLD_RPM,
    engineStoppingAt: stoppingAt,
    sessionId: openId,
    sessionStartedAt,
    last,
    updatedAt: data.device.updatedAt,
  };
}

function withAggregates(s: Session): Session {
  if (s.endedAt != null) return s;
  const ms = data.measurements.filter((m) => m.sessionId === s.id);
  if (ms.length === 0) {
    return { ...s, samples: 0, maxRpm: null, avgRpm: null, maxTemp: null, minOilPressure: null };
  }
  let maxRpm = -Infinity, sumRpm = 0, maxTemp = -Infinity, minOil = Infinity;
  for (const m of ms) {
    maxRpm = Math.max(maxRpm, m.rpm);
    sumRpm += m.rpm;
    maxTemp = Math.max(maxTemp, m.coolantTemp);
    minOil = Math.min(minOil, m.oilPressure);
  }
  return {
    ...s,
    samples: ms.length,
    maxRpm: Math.round(maxRpm),
    avgRpm: Math.round(sumRpm / ms.length),
    maxTemp: +maxTemp.toFixed(1),
    minOilPressure: +minOil.toFixed(2),
  };
}

export function listSessions(limit = 200): Session[] {
  return [...data.sessions]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
    .map(withAggregates);
}

export function getSession(id: number): SessionDetail | null {
  const s = data.sessions.find((x) => x.id === id);
  if (!s) return null;
  const measurements = data.measurements
    .filter((m) => m.sessionId === id)
    .sort((a, b) => a.ts - b.ts);
  const alarmEvents = data.alarmEvents
    .filter((e) => e.sessionId === id)
    .sort((a, b) => a.ts - b.ts);
  return { ...withAggregates(s), measurements, alarmEvents };
}

export function updateSessionName(id: number, name: string | null): boolean {
  const s = data.sessions.find((x) => x.id === id);
  if (!s) return false;
  s.name = name?.trim() || null;
  markDirty();
  return true;
}

export function deleteSession(id: number): boolean {
  const idx = data.sessions.findIndex((x) => x.id === id);
  if (idx === -1) return false;

  // Izbriši sesiju i sva njezina mjerenja i alarm događaje.
  data.sessions.splice(idx, 1);
  data.measurements = data.measurements.filter((m) => m.sessionId !== id);
  data.alarmEvents = data.alarmEvents.filter((e) => e.sessionId !== id);

  // Ako je upravo ova sesija bila otvorena, resetiraj stanje uređaja.
  if (data.device.openSessionId === id) {
    data.device.openSessionId = null;
    data.device.engineStoppingAt = null;
    resetAlarmState();
  }

  markDirty();
  return true;
}

export function recentMeasurements(limit = 240): Measurement[] {
  const all = data.measurements;
  return all.slice(Math.max(0, all.length - limit));
}

export function sessionStats() {
  const totalSessions = data.sessions.length;
  const closed = data.sessions.filter((s) => s.endedAt != null);

  let totalSec = 0;
  let longestSec = 0;
  for (const s of closed) {
    if (s.durationSec) {
      totalSec += s.durationSec;
      if (s.durationSec > longestSec) longestSec = s.durationSec;
    }
  }

  const totalAlarms = data.alarmEvents.filter((e) => e.to === "ALARM").length;

  return {
    totalSessions,
    totalEngineHours: +(totalSec / 3600).toFixed(1),
    avgSessionDurationSec: closed.length > 0 ? Math.round(totalSec / closed.length) : null,
    longestSessionSec: longestSec || null,
    totalAlarms,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Background watchdog — zatvara sesije kada uređaj prestane slati podatke.
//
// Problem koji rješava: kada se simulator zaustavi (Ctrl+C) ili uređaj izgubi
// napajanje, backend ne dobiva RPM=0 pa grace period nikad ne počne putem
// ingest(). Watchdog svake sekunde provjerava:
//   1. Je li zadnje mjerenje starije od DEVICE_STALE_MS? → pokrni grace period
//   2. Je li grace period istekao? → zatvori sesiju i objavi snapshot
// ─────────────────────────────────────────────────────────────────────────────

function closeSessionInBackground(openId: number, ts: number) {
  const sessionMs = data.measurements.filter((m) => m.sessionId === openId);
  const lastM = sessionMs[sessionMs.length - 1] ?? null;

  // Emitiraj alarm-reset događaje za sve aktivne alarme.
  const alarmState = getAlarmState();
  const newAlarmEvents: AlarmEvent[] = [];
  for (const key of ["rpm", "coolantTemp", "oilPressure"] as const) {
    if (alarmState[key] !== "OK") {
      const ae: AlarmEvent = {
        id: nextId("alarmEvent"),
        ts,
        sessionId: openId,
        parameter: key,
        from: alarmState[key],
        to: "OK",
        value: 0,
      };
      data.alarmEvents.push(ae);
      newAlarmEvents.push(ae);
    }
  }
  resetAlarmState();

  // Zatvori sesiju i izračunaj agregate.
  const s = data.sessions.find((x) => x.id === openId);
  if (s) {
    s.endedAt = ts;
    s.durationSec = Math.round((ts - s.startedAt) / 1000);
    s.endLat = lastM?.lat ?? null;
    s.endLng = lastM?.lng ?? null;
    if (sessionMs.length > 0) {
      let maxRpm = -Infinity, sumRpm = 0, maxTemp = -Infinity, minOil = Infinity;
      for (const x of sessionMs) {
        maxRpm = Math.max(maxRpm, x.rpm);
        sumRpm += x.rpm;
        maxTemp = Math.max(maxTemp, x.coolantTemp);
        minOil = Math.min(minOil, x.oilPressure);
      }
      s.samples = sessionMs.length;
      s.maxRpm = Math.round(maxRpm);
      s.avgRpm = Math.round(sumRpm / sessionMs.length);
      s.maxTemp = +maxTemp.toFixed(1);
      s.minOilPressure = +minOil.toFixed(2);
    }
  }

  data.device.engineStoppingAt = null;
  data.device.openSessionId = null;
  data.device.updatedAt = ts;
  markDirty();

  publish({
    deviceOn: data.device.deviceOn,
    engineRunning: false,
    engineStoppingAt: null,
    sessionId: null,
    sessionStartedAt: null,
    last: lastM,
    updatedAt: ts,
    recentAlarms: newAlarmEvents.length > 0 ? newAlarmEvents : undefined,
  });
}

function runGraceWatchdog() {
  const now = Date.now();
  const openId = data.device.openSessionId;
  if (!openId) return; // Nema otvorene sesije — nema što provjeravati.

  let stoppingAt = data.device.engineStoppingAt;
  const lastUpdate = data.device.updatedAt;

  // ── Korak 1: Uređaj je prestao slati podatke ──────────────────────────────
  if (stoppingAt == null && now - lastUpdate > DEVICE_STALE_MS) {
    // Pokrenemo grace period, ali ga datiramo od zadnjeg poznatog mjerenja
    // kako bi se oduzelo već proteklo "stale" vrijeme.
    data.device.engineStoppingAt = lastUpdate;
    stoppingAt = lastUpdate;
    markDirty();

    // Obavijesti klijente da je grace period počeo.
    const lastM = data.measurements[data.measurements.length - 1] ?? null;
    publish({
      deviceOn: data.device.deviceOn,
      engineRunning: false,
      engineStoppingAt: stoppingAt,
      sessionId: openId,
      sessionStartedAt:
        data.sessions.find((s) => s.id === openId)?.startedAt ?? null,
      last: lastM,
      updatedAt: lastUpdate,
    });
  }

  // ── Korak 2: Grace period je istekao ─────────────────────────────────────
  if (stoppingAt != null && now - stoppingAt >= ENGINE_STOP_GRACE_MS) {
    closeSessionInBackground(openId, now);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __marineGraceWatchdog: ReturnType<typeof setInterval> | undefined;
}

if (!global.__marineGraceWatchdog) {
  global.__marineGraceWatchdog = setInterval(runGraceWatchdog, 1000);
}
