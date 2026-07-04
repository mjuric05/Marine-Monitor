import fs from "node:fs";
import path from "node:path";
import type { AlarmEvent, AlarmLevel, Measurement, Session } from "@/lib/types";

/*
 * Lagana, pure-JS perzistencija (JSON datoteka). Bez nativnih ovisnosti, pa
 * radi svuda gdje radi Node. Za veće količine podataka ili produkciju preporuča
 * se zamjena SQLite-om (npr. better-sqlite3) ili pravom bazom — vidi README.
 */

export interface DeviceState {
  deviceOn: boolean;
  openSessionId: number | null;
  /** ms epoch kada je RPM pao ispod praga; null ako motor radi ili je sesija već zatvorena. */
  engineStoppingAt: number | null;
  updatedAt: number;
}

interface DataShape {
  seq: { session: number; measurement: number; alarmEvent: number };
  device: DeviceState;
  sessions: Session[];
  measurements: Measurement[];
  alarmEvents: AlarmEvent[];
}

const DB_PATH =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "marine.json");

declare global {
  // eslint-disable-next-line no-var
  var __marineData: DataShape | undefined;
  // eslint-disable-next-line no-var
  var __marineDirty: boolean | undefined;
  // eslint-disable-next-line no-var
  var __marineFlusher: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var __marineAlarmState: Record<string, AlarmLevel> | undefined;
}

function load(): DataShape {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as DataShape;
    if (parsed && parsed.seq && parsed.device) {
      // Backwards compat: dodaj polja uvedena u novijim verzijama
      if (!parsed.alarmEvents) parsed.alarmEvents = [];
      if (!parsed.seq.alarmEvent) parsed.seq.alarmEvent = 0;
      if (parsed.device.engineStoppingAt === undefined)
        parsed.device.engineStoppingAt = null;
      return parsed;
    }
  } catch {
    /* nema datoteke ili je neispravna → kreni od nule */
  }
  return {
    seq: { session: 0, measurement: 0, alarmEvent: 0 },
    device: { deviceOn: false, openSessionId: null, engineStoppingAt: null, updatedAt: 0 },
    sessions: [],
    measurements: [],
    alarmEvents: [],
  };
}

export const data: DataShape = global.__marineData ?? load();
global.__marineData = data;

export function markDirty() {
  global.__marineDirty = true;
}

function flush() {
  if (!global.__marineDirty) return;
  global.__marineDirty = false;
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const tmp = DB_PATH + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, DB_PATH); // atomičan zapis
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("greška pri zapisu baze:", e);
  }
}

// Periodični flush (najviše jednom u sekundi) + zapis pri izlasku.
if (!global.__marineFlusher) {
  global.__marineFlusher = setInterval(flush, 1000);
  const onExit = () => {
    flush();
    process.exit();
  };
  process.on("SIGINT", onExit);
  process.on("SIGTERM", onExit);
  process.on("beforeExit", flush);
}

export function nextId(kind: "session" | "measurement" | "alarmEvent"): number {
  data.seq[kind] += 1;
  return data.seq[kind];
}

export function getAlarmState(): Record<string, AlarmLevel> {
  if (!global.__marineAlarmState) {
    global.__marineAlarmState = {
      rpm: "OK",
      coolantTemp: "OK",
      oilPressure: "OK",
    };
  }
  return global.__marineAlarmState;
}

export function resetAlarmState(): void {
  global.__marineAlarmState = {
    rpm: "OK",
    coolantTemp: "OK",
    oilPressure: "OK",
  };
}

export function recentAlarmEvents(limit = 50): AlarmEvent[] {
  const all = data.alarmEvents;
  return all.slice(Math.max(0, all.length - limit)).reverse();
}
