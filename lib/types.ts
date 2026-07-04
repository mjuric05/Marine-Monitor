// Zajednički tipovi za cijelu aplikaciju.

export type AlarmLevel = "OK" | "WARN" | "ALARM";

export type TrendDirection = "up" | "down" | "stable";

/** Jedno mjerenje koje uređaj (Arduino/RPi) šalje ili simulator generira. */
export interface IngestPayload {
  rpm: number; // broj okretaja [o/min]
  coolantTemp: number; // temperatura rashladne tekućine [°C]
  oilPressure: number; // tlak ulja [bar]
  lat?: number | null; // zemljopisna širina
  lng?: number | null; // zemljopisna dužina
  deviceOn?: boolean; // je li uređaj (Arduino/RPi) upaljen
  ts?: number; // vremenska oznaka (ms epoch); ako se izostavi, postavlja poslužitelj
}

/** Zapis mjerenja kako se pohranjuje i prosljeđuje klijentu. */
export interface Measurement {
  id: number;
  sessionId: number | null;
  ts: number;
  rpm: number;
  coolantTemp: number;
  oilPressure: number;
  lat: number | null;
  lng: number | null;
}

/** Događaj promjene razine alarma za jedan parametar. */
export interface AlarmEvent {
  id: number;
  ts: number;
  sessionId: number | null;
  parameter: "rpm" | "coolantTemp" | "oilPressure";
  from: AlarmLevel;
  to: AlarmLevel;
  value: number;
}

/** Trenutni snapshot stanja sustava koji se prikazuje na nadzornoj ploči. */
export interface Snapshot {
  deviceOn: boolean;
  engineRunning: boolean;
  /**
   * Vremenski pečat kada je RPM pao ispod praga. Ako nije null, sesija je u
   * "grace periodu" — neće se zatvoriti dok ne prođe ENGINE_STOP_GRACE_MS.
   */
  engineStoppingAt: number | null;
  sessionId: number | null;
  sessionStartedAt: number | null;
  last: Measurement | null;
  updatedAt: number;
  recentAlarms?: AlarmEvent[];
}

/** Radna sesija motora (od paljenja do gašenja). */
export interface Session {
  id: number;
  name?: string | null;
  startedAt: number;
  endedAt: number | null;
  durationSec: number | null;
  samples: number;
  maxRpm: number | null;
  avgRpm: number | null;
  maxTemp: number | null;
  minOilPressure: number | null;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
}

export interface SessionDetail extends Session {
  measurements: Measurement[];
  alarmEvents: AlarmEvent[];
}
