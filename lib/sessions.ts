import { sql, ensureSchema } from "@/lib/db";
import { RUN_THRESHOLD_RPM, evaluate } from "@/config/thresholds";
import { ENGINE_STOP_GRACE_MS, DEVICE_STALE_MS } from "@/config/engine";
import type {
  AlarmEvent,
  AlarmLevel,
  IngestPayload,
  Measurement,
  Session,
  SessionDetail,
  Snapshot,
} from "@/lib/types";

/*
 * Obrađuje jedno dolazno mjerenje.
 *
 * Grace period (20 s): ako RPM padne ispod praga, sesija se NE zatvara odmah.
 * Tek kada 20 s prođe bez oporavka, sesija se zatvara i gaugeovi se resetiraju.
 * Ako RPM poraste unutar 20 s, grace period se poništava i sesija nastavlja.
 *
 * Napomena o pozadinskom nadzoru: budući da serverless funkcije ne mogu
 * pokretati pozadinski timer, "watchdog" koji zatvara sesiju kada uređaj
 * prestane slati podatke (vidi tickWatchdog niže) izvodi se lijeno — na
 * početku svakog čitanja stanja (currentSnapshot/listSessions/getSession).
 * To znači da će zatvaranje uslijed prestanka prometa kasniti do sljedećeg
 * zahtjeva (npr. sljedećeg osvježavanja nadzorne ploče), a ne unutar 1 s
 * kao kod stalno pokrenutog procesa.
 */

type ParamKey = "rpm" | "coolantTemp" | "oilPressure";
type Alarms = Record<ParamKey, AlarmLevel>;

interface DeviceStateRow {
  deviceOn: boolean;
  openSessionId: number | null;
  engineStoppingAt: number | null;
  updatedAt: number;
  alarms: Alarms;
}

function rowToSession(r: any): Session {
  return {
    id: r.id,
    name: r.name,
    startedAt: Number(r.started_at),
    endedAt: r.ended_at == null ? null : Number(r.ended_at),
    durationSec: r.duration_sec,
    samples: r.samples,
    maxRpm: r.max_rpm,
    avgRpm: r.avg_rpm,
    maxTemp: r.max_temp,
    minOilPressure: r.min_oil_pressure,
    startLat: r.start_lat,
    startLng: r.start_lng,
    endLat: r.end_lat,
    endLng: r.end_lng,
  };
}

function rowToMeasurement(r: any): Measurement {
  return {
    id: r.id,
    sessionId: r.session_id,
    ts: Number(r.ts),
    rpm: r.rpm,
    coolantTemp: r.coolant_temp,
    oilPressure: r.oil_pressure,
    lat: r.lat,
    lng: r.lng,
  };
}

function rowToAlarmEvent(r: any): AlarmEvent {
  return {
    id: r.id,
    ts: Number(r.ts),
    sessionId: r.session_id,
    parameter: r.parameter,
    from: r.from_level,
    to: r.to_level,
    value: r.value,
  };
}

async function readDeviceState(): Promise<DeviceStateRow> {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM device_state WHERE id = 1`;
  const r = rows[0];
  return {
    deviceOn: r.device_on,
    openSessionId: r.open_session_id,
    engineStoppingAt: r.engine_stopping_at == null ? null : Number(r.engine_stopping_at),
    updatedAt: Number(r.updated_at),
    alarms: {
      rpm: r.alarm_rpm,
      coolantTemp: r.alarm_coolant_temp,
      oilPressure: r.alarm_oil_pressure,
    },
  };
}

async function getSessionStartedAt(id: number): Promise<number | null> {
  const { rows } = await sql`SELECT started_at FROM sessions WHERE id = ${id}`;
  return rows[0] ? Number(rows[0].started_at) : null;
}

// Zatvara sesiju: emitira alarm-reset događaje za aktivne alarme, izračunava
// agregate iz measurements i upisuje ih na sessions. Koristi ga i ingest()
// (kad RPM padne i grace period istekne) i tickWatchdog() (kad uređaj prestane
// slati podatke).
async function closeSession(
  id: number,
  ts: number,
  alarms: Alarms
): Promise<{ alarmResetEvents: AlarmEvent[]; alarms: Alarms }> {
  const alarmResetEvents: AlarmEvent[] = [];
  const nextAlarms: Alarms = { ...alarms };
  for (const key of ["rpm", "coolantTemp", "oilPressure"] as const) {
    if (alarms[key] !== "OK") {
      const { rows } = await sql`
        INSERT INTO alarm_events (session_id, ts, parameter, from_level, to_level, value)
        VALUES (${id}, ${ts}, ${key}, ${alarms[key]}, 'OK', 0)
        RETURNING id
      `;
      alarmResetEvents.push({
        id: rows[0].id,
        ts,
        sessionId: id,
        parameter: key,
        from: alarms[key],
        to: "OK",
        value: 0,
      });
      nextAlarms[key] = "OK";
    }
  }

  const { rows: aggRows } = await sql`
    SELECT
      COUNT(*)::int AS samples,
      MAX(rpm) AS max_rpm,
      AVG(rpm) AS avg_rpm,
      MAX(coolant_temp) AS max_temp,
      MIN(oil_pressure) AS min_oil_pressure,
      (ARRAY_AGG(lat ORDER BY ts DESC, id DESC))[1] AS last_lat,
      (ARRAY_AGG(lng ORDER BY ts DESC, id DESC))[1] AS last_lng
    FROM measurements WHERE session_id = ${id}
  `;
  const agg = aggRows[0];
  const startedAt = await getSessionStartedAt(id);
  const durationSec = startedAt != null ? Math.round((ts - startedAt) / 1000) : null;

  await sql`
    UPDATE sessions SET
      ended_at = ${ts},
      duration_sec = ${durationSec},
      samples = ${agg.samples},
      max_rpm = ${agg.samples > 0 ? Math.round(agg.max_rpm) : null},
      avg_rpm = ${agg.samples > 0 ? Math.round(agg.avg_rpm) : null},
      max_temp = ${agg.samples > 0 ? Number(Number(agg.max_temp).toFixed(1)) : null},
      min_oil_pressure = ${agg.samples > 0 ? Number(Number(agg.min_oil_pressure).toFixed(2)) : null},
      end_lat = ${agg.last_lat},
      end_lng = ${agg.last_lng}
    WHERE id = ${id}
  `;

  return { alarmResetEvents, alarms: nextAlarms };
}

// Zamjena za pozadinski setInterval watchdog: provjerava je li uređaj
// prestao slati podatke (DEVICE_STALE_MS) i je li grace period istekao
// (ENGINE_STOP_GRACE_MS), te po potrebi zatvara otvorenu sesiju. Poziva se na
// početku svakog čitanja stanja.
async function tickWatchdog(now: number): Promise<void> {
  const ds = await readDeviceState();
  const openId = ds.openSessionId;
  if (openId == null) return;

  let stoppingAt = ds.engineStoppingAt;

  if (stoppingAt == null && now - ds.updatedAt > DEVICE_STALE_MS) {
    stoppingAt = ds.updatedAt;
    await sql`UPDATE device_state SET engine_stopping_at = ${stoppingAt} WHERE id = 1`;
  }

  if (stoppingAt != null && now - stoppingAt >= ENGINE_STOP_GRACE_MS) {
    const { alarms } = await closeSession(openId, now, ds.alarms);
    await sql`
      UPDATE device_state SET
        open_session_id = NULL,
        engine_stopping_at = NULL,
        updated_at = ${now},
        alarm_rpm = ${alarms.rpm},
        alarm_coolant_temp = ${alarms.coolantTemp},
        alarm_oil_pressure = ${alarms.oilPressure}
      WHERE id = 1
    `;
  }
}

export async function ingest(payload: IngestPayload): Promise<Snapshot> {
  const ts = payload.ts ?? Date.now();
  const rpm = Number(payload.rpm) || 0;
  const coolantTemp = Number(payload.coolantTemp) || 0;
  const oilPressure = Number(payload.oilPressure) || 0;
  const lat = payload.lat ?? null;
  const lng = payload.lng ?? null;
  const deviceOn = payload.deviceOn ?? true;

  const ds = await readDeviceState();
  const running = rpm > RUN_THRESHOLD_RPM;
  let openId = ds.openSessionId;
  let stoppingAt = ds.engineStoppingAt;
  let alarms: Alarms = { ...ds.alarms };

  // ── Motor radi ────────────────────────────────────────────────────────────
  if (running) {
    if (stoppingAt != null) stoppingAt = null;
    if (openId == null) {
      const { rows } = await sql`
        INSERT INTO sessions (started_at, samples, start_lat, start_lng)
        VALUES (${ts}, 0, ${lat}, ${lng})
        RETURNING id
      `;
      openId = rows[0].id;
    }
  }

  // Spremi mjerenje (uvijek, neovisno o stanju).
  const { rows: mRows } = await sql`
    INSERT INTO measurements (session_id, ts, rpm, coolant_temp, oil_pressure, lat, lng)
    VALUES (${openId}, ${ts}, ${rpm}, ${coolantTemp}, ${oilPressure}, ${lat}, ${lng})
    RETURNING id
  `;
  const m: Measurement = {
    id: mRows[0].id,
    sessionId: openId,
    ts,
    rpm,
    coolantTemp,
    oilPressure,
    lat,
    lng,
  };

  // Prati alarm tranzicije samo dok motor stvarno radi.
  const newAlarmEvents: AlarmEvent[] = [];
  if (running) {
    for (const key of ["rpm", "coolantTemp", "oilPressure"] as const) {
      const newLevel = evaluate(key, m[key]);
      const prevLevel = alarms[key] ?? "OK";
      if (newLevel !== prevLevel) {
        const { rows } = await sql`
          INSERT INTO alarm_events (session_id, ts, parameter, from_level, to_level, value)
          VALUES (${openId}, ${ts}, ${key}, ${prevLevel}, ${newLevel}, ${m[key]})
          RETURNING id
        `;
        const ae: AlarmEvent = {
          id: rows[0].id,
          ts,
          sessionId: openId,
          parameter: key,
          from: prevLevel,
          to: newLevel,
          value: m[key],
        };
        newAlarmEvents.push(ae);
        alarms[key] = newLevel;
      }
    }
  }

  // ── Motor ne radi, sesija je otvorena ────────────────────────────────────
  if (!running && openId != null) {
    if (stoppingAt == null) {
      stoppingAt = ts;
    } else if (ts - stoppingAt >= ENGINE_STOP_GRACE_MS) {
      const closed = await closeSession(openId, ts, alarms);
      newAlarmEvents.push(...closed.alarmResetEvents);
      alarms = closed.alarms;
      stoppingAt = null;
      openId = null;
    }
  }

  await sql`
    UPDATE device_state SET
      device_on = ${deviceOn},
      open_session_id = ${openId},
      engine_stopping_at = ${stoppingAt},
      updated_at = ${ts},
      alarm_rpm = ${alarms.rpm},
      alarm_coolant_temp = ${alarms.coolantTemp},
      alarm_oil_pressure = ${alarms.oilPressure}
    WHERE id = 1
  `;

  const sessionStartedAt = openId != null ? await getSessionStartedAt(openId) : null;

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
  return snap;
}

export async function currentSnapshot(): Promise<Snapshot> {
  await tickWatchdog(Date.now());
  const ds = await readDeviceState();
  const { rows } = await sql`SELECT * FROM measurements ORDER BY id DESC LIMIT 1`;
  const last = rows[0] ? rowToMeasurement(rows[0]) : null;
  const sessionStartedAt =
    ds.openSessionId != null ? await getSessionStartedAt(ds.openSessionId) : null;
  return {
    deviceOn: ds.deviceOn,
    engineRunning: (last?.rpm ?? 0) > RUN_THRESHOLD_RPM,
    engineStoppingAt: ds.engineStoppingAt,
    sessionId: ds.openSessionId,
    sessionStartedAt,
    last,
    updatedAt: ds.updatedAt,
  };
}

async function withAggregates(s: Session): Promise<Session> {
  if (s.endedAt != null) return s;
  const { rows } = await sql`
    SELECT
      COUNT(*)::int AS samples,
      MAX(rpm) AS max_rpm,
      AVG(rpm) AS avg_rpm,
      MAX(coolant_temp) AS max_temp,
      MIN(oil_pressure) AS min_oil_pressure
    FROM measurements WHERE session_id = ${s.id}
  `;
  const agg = rows[0];
  if (!agg || agg.samples === 0) {
    return { ...s, samples: 0, maxRpm: null, avgRpm: null, maxTemp: null, minOilPressure: null };
  }
  return {
    ...s,
    samples: agg.samples,
    maxRpm: Math.round(agg.max_rpm),
    avgRpm: Math.round(agg.avg_rpm),
    maxTemp: Number(Number(agg.max_temp).toFixed(1)),
    minOilPressure: Number(Number(agg.min_oil_pressure).toFixed(2)),
  };
}

export async function listSessions(limit = 200): Promise<Session[]> {
  await tickWatchdog(Date.now());
  const { rows } = await sql`SELECT * FROM sessions ORDER BY started_at DESC LIMIT ${limit}`;
  return Promise.all(rows.map((r) => withAggregates(rowToSession(r))));
}

export async function getSession(id: number): Promise<SessionDetail | null> {
  await tickWatchdog(Date.now());
  const { rows } = await sql`SELECT * FROM sessions WHERE id = ${id}`;
  if (!rows[0]) return null;
  const s = await withAggregates(rowToSession(rows[0]));

  const { rows: mRows } = await sql`
    SELECT * FROM measurements WHERE session_id = ${id} ORDER BY ts ASC
  `;
  const { rows: aRows } = await sql`
    SELECT * FROM alarm_events WHERE session_id = ${id} ORDER BY ts ASC
  `;

  return {
    ...s,
    measurements: mRows.map(rowToMeasurement),
    alarmEvents: aRows.map(rowToAlarmEvent),
  };
}

export async function updateSessionName(id: number, name: string | null): Promise<boolean> {
  await ensureSchema();
  const trimmed = name?.trim() || null;
  const { rowCount } = await sql`UPDATE sessions SET name = ${trimmed} WHERE id = ${id}`;
  return (rowCount ?? 0) > 0;
}

export async function deleteSession(id: number): Promise<boolean> {
  const { rowCount } = await sql`DELETE FROM sessions WHERE id = ${id}`;
  if (!rowCount) return false;

  // Ako je upravo ova sesija bila otvorena, resetiraj stanje uređaja.
  const ds = await readDeviceState();
  if (ds.openSessionId === id) {
    await sql`
      UPDATE device_state SET
        open_session_id = NULL,
        engine_stopping_at = NULL,
        alarm_rpm = 'OK',
        alarm_coolant_temp = 'OK',
        alarm_oil_pressure = 'OK'
      WHERE id = 1
    `;
  }
  return true;
}

export async function recentMeasurements(limit = 240): Promise<Measurement[]> {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM measurements ORDER BY id DESC LIMIT ${limit}`;
  return rows.map(rowToMeasurement).reverse();
}

export async function sessionStats() {
  await ensureSchema();
  const { rows: sessRows } = await sql`
    SELECT
      COUNT(*)::int AS total_sessions,
      COALESCE(SUM(duration_sec) FILTER (WHERE ended_at IS NOT NULL), 0)::int AS total_sec,
      COALESCE(MAX(duration_sec) FILTER (WHERE ended_at IS NOT NULL), 0)::int AS longest_sec,
      COUNT(*) FILTER (WHERE ended_at IS NOT NULL)::int AS closed_count
    FROM sessions
  `;
  const { rows: alarmRows } = await sql`
    SELECT COUNT(*)::int AS total_alarms FROM alarm_events WHERE to_level = 'ALARM'
  `;
  const r = sessRows[0];
  return {
    totalSessions: r.total_sessions,
    totalEngineHours: Number((r.total_sec / 3600).toFixed(1)),
    avgSessionDurationSec: r.closed_count > 0 ? Math.round(r.total_sec / r.closed_count) : null,
    longestSessionSec: r.longest_sec || null,
    totalAlarms: alarmRows[0].total_alarms,
  };
}

export async function recentAlarmEvents(limit = 50): Promise<AlarmEvent[]> {
  await ensureSchema();
  const { rows } = await sql`SELECT * FROM alarm_events ORDER BY id DESC LIMIT ${limit}`;
  return rows.map(rowToAlarmEvent);
}
