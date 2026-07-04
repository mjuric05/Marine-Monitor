import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/*
 * Perzistencija u Neon Postgres (Vercel Marketplace integracija). Serverless
 * funkcije su bez stanja (svaki poziv može završiti na drugoj instanci, bez
 * zajedničke memorije ili diska), pa sve što treba preživjeti između poziva
 * mora biti u bazi.
 */

let client: NeonQueryFunction<false, true> | null = null;

function getClient(): NeonQueryFunction<false, true> {
  if (!client) {
    const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("Nedostaje POSTGRES_URL (ili DATABASE_URL) varijabla okruženja.");
    }
    // Neon-ov HTTP driver interno koristi fetch(); bez ovoga Next.js bi ga
    // po defaultu keširao (Data Cache) pa bi API rute vraćale zastarjele
    // podatke unatoč `dynamic = "force-dynamic"`.
    client = neon(connectionString, { fullResults: true, fetchOptions: { cache: "no-store" } });
  }
  return client;
}

// Lijeni omotač oko neon() — spaja se tek pri prvom upitu, ne pri importu
// modula (npr. tijekom `next build`, kad varijabla okruženja možda još nije
// dostupna).
export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  return getClient()(strings, ...values);
}

let schemaReady: Promise<void> | null = null;

async function createSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS device_state (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      device_on BOOLEAN NOT NULL DEFAULT false,
      open_session_id INTEGER,
      engine_stopping_at BIGINT,
      updated_at BIGINT NOT NULL DEFAULT 0,
      alarm_rpm TEXT NOT NULL DEFAULT 'OK',
      alarm_coolant_temp TEXT NOT NULL DEFAULT 'OK',
      alarm_oil_pressure TEXT NOT NULL DEFAULT 'OK',
      CHECK (id = 1)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      name TEXT,
      started_at BIGINT NOT NULL,
      ended_at BIGINT,
      duration_sec INTEGER,
      samples INTEGER NOT NULL DEFAULT 0,
      max_rpm INTEGER,
      avg_rpm INTEGER,
      max_temp REAL,
      min_oil_pressure REAL,
      start_lat DOUBLE PRECISION,
      start_lng DOUBLE PRECISION,
      end_lat DOUBLE PRECISION,
      end_lng DOUBLE PRECISION
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS measurements (
      id SERIAL PRIMARY KEY,
      session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
      ts BIGINT NOT NULL,
      rpm REAL NOT NULL,
      coolant_temp REAL NOT NULL,
      oil_pressure REAL NOT NULL,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_measurements_session ON measurements(session_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_measurements_ts ON measurements(ts)`;
  await sql`
    CREATE TABLE IF NOT EXISTS alarm_events (
      id SERIAL PRIMARY KEY,
      session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
      ts BIGINT NOT NULL,
      parameter TEXT NOT NULL,
      from_level TEXT NOT NULL,
      to_level TEXT NOT NULL,
      value REAL NOT NULL
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_alarm_events_session ON alarm_events(session_id)`;
  await sql`INSERT INTO device_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
}

// Memoizirano po hladnom startu funkcije; ako prvi pokušaj ne uspije, sljedeći
// poziv će pokušati ponovno umjesto da zauvijek vrati odbijeni promise.
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = createSchema().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}
