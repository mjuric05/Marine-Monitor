# NOTES — Engine Watch (Marine Diesel Engine Monitoring System)

Detailed technical reference for the accompanying research paper. Covers what
the application is, how it is built, which technologies it uses, and how it
behaves end to end — from a physical sensor reading to a rendered dashboard.

---

## 1. Purpose and Domain Context

Engine Watch is a full-stack web application that monitors a marine diesel
engine in real time. It is the companion software for a thesis on an
engine-monitoring system based on the **SAE J1939 / CAN bus** protocol, the
standard used on heavy-duty and marine diesel engines for broadcasting sensor
data (RPM, temperatures, pressures, fault codes, …) over a shared bus.

The physical pipeline the software supports is:

```
Engine sensors → CAN bus (J1939 frames) → Arduino/Raspberry Pi decoder
              → JSON over HTTP → this web app → dashboard (operator)
```

The decoding device (Raspberry Pi with SocketCAN, or Arduino with an MCP2515
CAN controller) is outside this repository — it is documented in the thesis
itself. This app is what the decoder talks to and what the operator looks at.
It also ships a **simulator** (`simulator/simulate.js`) that emits realistic
J1939-shaped traffic so the whole system can be demonstrated and tested
without physical hardware.

Three parameters are tracked:

| Parameter | Unit (metric) | Danger direction | Warn | Alarm |
|---|---|---|---|---|
| RPM (broj okretaja) | o/min | high | 2000 | 2300 |
| Coolant temperature | °C | high | 90 | 98 |
| Oil pressure | bar | **low** | 2.0 | 1.5 |

---

## 2. Technology Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | **Next.js 14 (App Router)**, React 18, TypeScript | Single codebase for UI + API (Route Handlers), file-based routing, server components for data-heavy pages |
| Styling | **Tailwind CSS** | Utility-first styling, small custom `.panel` design-system layer on top |
| Charts | **Recharts** | Declarative SVG line charts with a `ResponsiveContainer` that tracks its parent's size |
| Map | **React-Leaflet** + OpenStreetMap (CARTO dark tiles) | GPS position/track rendering |
| Database | **Neon Postgres** (serverless Postgres, accessed via `@neondatabase/serverless`) | Relational data (sessions ↔ measurements ↔ alarm events), HTTP-based driver that works from serverless functions |
| Hosting | **Vercel** | Zero-config Next.js hosting, serverless functions, integrates natively with Neon |
| Real-time updates | **HTTP polling** (not WebSockets/SSE) | Serverless functions can't hold open connections or run background timers — see §6 |

`package.json` dependencies (trimmed):

```json
"dependencies": {
  "@neondatabase/serverless": "^0.10.4",
  "leaflet": "^1.9.4",
  "next": "^14.2.33",
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-leaflet": "^4.2.1",
  "recharts": "^2.12.7"
}
```

---

## 3. High-Level Architecture

```
                        ┌─────────────────────────────┐
  Device / Simulator ──►│  POST /api/ingest           │
                        │  (Next.js Route Handler)    │
                        └───────────────┬─────────────┘
                                        │ lib/sessions.ts: ingest()
                                        ▼
                        ┌─────────────────────────────┐
                        │   Neon Postgres              │
                        │   device_state / sessions /   │
                        │   measurements / alarm_events │
                        └───────────────┬─────────────┘
                                        │ SQL reads
                    ┌───────────────────┼────────────────────┐
                    ▼                   ▼                    ▼
          GET /api/latest       GET /api/sessions     GET /api/sessions/:id
          (poll every 1.2s)     (sessions list page)   (session detail page)
                    │
                    ▼
         hooks/useLiveData.ts (client)
                    │
                    ▼
           components/Dashboard.tsx
       (Gauge, LiveCharts, MapView, AlarmLog, …)
```

The app was originally built around a stateful, always-running Node process
(in-memory data + a JSON file on disk + Server-Sent Events). It was later
migrated to the architecture above so it could run on Vercel's serverless
platform, which has no persistent disk/memory and cannot run background
timers between requests. That migration — and the reasoning behind each
change — is documented in §6 and §9, since it is itself a relevant
engineering case study for the thesis (moving an embedded-adjacent,
stateful monitoring system onto a stateless serverless platform).

---

## 4. Database Schema

Four tables in Neon Postgres, created lazily and idempotently on first query
(`ensureSchema()` in `lib/db.ts` — no separate migration step or ORM):

```sql
CREATE TABLE IF NOT EXISTS device_state (
  id SMALLINT PRIMARY KEY DEFAULT 1,       -- single row (id = 1), holds "live" state
  device_on BOOLEAN NOT NULL DEFAULT false,
  open_session_id INTEGER,
  engine_stopping_at BIGINT,               -- epoch ms; set while in the "grace period"
  updated_at BIGINT NOT NULL DEFAULT 0,
  alarm_rpm TEXT NOT NULL DEFAULT 'OK',
  alarm_coolant_temp TEXT NOT NULL DEFAULT 'OK',
  alarm_oil_pressure TEXT NOT NULL DEFAULT 'OK',
  CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  name TEXT,
  started_at BIGINT NOT NULL,
  ended_at BIGINT,
  duration_sec INTEGER,
  samples INTEGER NOT NULL DEFAULT 0,
  max_rpm INTEGER, avg_rpm INTEGER,
  max_temp REAL, min_oil_pressure REAL,
  start_lat DOUBLE PRECISION, start_lng DOUBLE PRECISION,
  end_lat DOUBLE PRECISION, end_lng DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS measurements (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  ts BIGINT NOT NULL,                      -- epoch ms, as sent by the device
  rpm REAL NOT NULL, coolant_temp REAL NOT NULL, oil_pressure REAL NOT NULL,
  lat DOUBLE PRECISION, lng DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS alarm_events (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
  ts BIGINT NOT NULL,
  parameter TEXT NOT NULL,                 -- 'rpm' | 'coolantTemp' | 'oilPressure'
  from_level TEXT NOT NULL, to_level TEXT NOT NULL,  -- 'OK' | 'WARN' | 'ALARM'
  value REAL NOT NULL
);
```

Design notes:

- `device_state` is a **singleton row** (`id = 1`, enforced by a `CHECK`
  constraint) — it's the only piece of "current state" (is the device on, is
  there an open session, what's the current alarm level per parameter). This
  replaces what used to be an in-memory global.
- `measurements` and `alarm_events` cascade-delete when their parent
  `sessions` row is deleted, so removing a session cleans up everything that
  belongs to it in one statement.
- Session aggregates (`max_rpm`, `avg_rpm`, `max_temp`, `min_oil_pressure`)
  are **computed with SQL `MAX`/`AVG`/`MIN` over `measurements`** at
  session-close time (and on the fly for still-open sessions), not
  maintained incrementally — simpler and correct by construction, at the
  cost of one aggregate query per read of an open session.

The database client itself is a thin lazy wrapper (`lib/db.ts`) around
`@neondatabase/serverless`'s `neon()` tagged-template query function:

```ts
export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  return getClient()(strings, ...values);
}
```

It is lazy (the actual connection/client is only constructed on the first
real query, not at module import time) so that `next build` doesn't fail if
the database URL isn't available yet at build time, and so that the schema
is created transparently the first time any request touches the database.

---

## 5. Backend Logic (`lib/sessions.ts`)

All business logic lives in one module, exposed as a set of `async`
functions consumed directly by Next.js Route Handlers (no separate
service/controller layers — Route Handlers are already the controller
layer in the App Router).

### 5.1 Ingest pipeline

`POST /api/ingest` receives one JSON measurement and calls `ingest()`, which:

1. Reads the current `device_state` row.
2. Decides whether the engine is "running" (`rpm > RUN_THRESHOLD_RPM`, 300
   RPM — chosen as a value clearly above idle/starter cranking but below any
   real running RPM).
3. **Opens a session** (inserts a new `sessions` row) the moment the engine
   transitions from not-running to running, if one isn't already open.
4. Always inserts the measurement into `measurements` (linked to the
   currently open session, or `NULL` if the engine is idle).
5. Evaluates the three parameters against their thresholds and inserts an
   `alarm_events` row for every level transition (`OK → WARN`, `WARN →
   ALARM`, `ALARM → OK`, etc.) — never for values that stay in the same band.
6. Handles the **grace period**: if RPM drops below the run threshold while
   a session is open, the session is *not* closed immediately. A 20-second
   timer (`ENGINE_STOP_GRACE_MS`) starts; if RPM recovers within that window,
   the session simply continues. If it doesn't, the session is closed and
   its aggregates are computed.

Simplified excerpt:

```ts
export async function ingest(payload: IngestPayload): Promise<Snapshot> {
  const ts = payload.ts ?? Date.now();
  const rpm = Number(payload.rpm) || 0;
  // ...
  const ds = await readDeviceState();
  const running = rpm > RUN_THRESHOLD_RPM;
  let openId = ds.openSessionId;
  let stoppingAt = ds.engineStoppingAt;

  if (running) {
    if (stoppingAt != null) stoppingAt = null;      // recovered — cancel grace period
    if (openId == null) {                            // idle → running: open a session
      const { rows } = await sql`
        INSERT INTO sessions (started_at, samples, start_lat, start_lng)
        VALUES (${ts}, 0, ${lat}, ${lng}) RETURNING id`;
      openId = rows[0].id;
    }
  }

  // ... insert the measurement, evaluate alarms ...

  if (!running && openId != null) {
    if (stoppingAt == null) {
      stoppingAt = ts;                                // start the grace period
    } else if (ts - stoppingAt >= ENGINE_STOP_GRACE_MS) {
      const closed = await closeSession(openId, ts, alarms);  // grace period expired
      openId = null;
      stoppingAt = null;
    }
  }
  // ... persist device_state, return a Snapshot ...
}
```

### 5.2 Alarm evaluation (`config/thresholds.ts`)

Threshold logic is centralised in one pure function, independent of the
database, so it can be unit-tested or reused on both the direction a
parameter is dangerous in:

```ts
export function evaluate(
  key: ParamConfig["key"],
  value: number,
  overrides?: { warn: number; alarm: number }
): AlarmLevel {
  const c = PARAMS[key];
  const warn = overrides?.warn ?? c.warn;
  const alarm = overrides?.alarm ?? c.alarm;
  if (c.direction === "high") {
    if (value >= alarm) return "ALARM";
    if (value >= warn) return "WARN";
    return "OK";
  } else {
    // low is bad (oil pressure)
    if (value <= alarm) return "ALARM";
    if (value <= warn) return "WARN";
    return "OK";
  }
}
```

Per-parameter thresholds can be overridden from the UI (`ThresholdEditor`
component), persisted client-side, and passed back into `evaluate()` when
rendering — the server always evaluates against the *default* thresholds for
its own alarm-event log, while the dashboard can additionally reflect a
user's custom thresholds visually.

### 5.3 The watchdog — serverless-specific design

The engine can also stop sending data entirely (device powered off, lost
connectivity) without ever sending a final "RPM = 0" reading. On a normal
always-on server this would be handled by a `setInterval` background timer
checking every second. **Serverless functions cannot do this** — there is no
process running between requests to host the timer.

Instead, a `tickWatchdog(now)` function runs the same staleness/grace-period
logic **lazily, at the start of every read** (`currentSnapshot`,
`listSessions`, `getSession`):

```ts
async function tickWatchdog(now: number): Promise<void> {
  const ds = await readDeviceState();
  const openId = ds.openSessionId;
  if (openId == null) return;

  let stoppingAt = ds.engineStoppingAt;
  if (stoppingAt == null && now - ds.updatedAt > DEVICE_STALE_MS) {
    stoppingAt = ds.updatedAt;                 // no data for 3s → assume device stopped
    await sql`UPDATE device_state SET engine_stopping_at = ${stoppingAt} WHERE id = 1`;
  }
  if (stoppingAt != null && now - stoppingAt >= ENGINE_STOP_GRACE_MS) {
    const { alarms } = await closeSession(openId, now, ds.alarms);
    await sql`UPDATE device_state SET open_session_id = NULL, ... WHERE id = 1`;
  }
}
```

Because the dashboard polls `/api/latest` roughly every 1.2 seconds while
open, this reproduces the same effective behaviour as a 1-second background
timer in practice — the "timer tick" is simply driven by the next incoming
HTTP request instead of the OS clock. The only observable difference is that
if *nobody* is looking at the dashboard and no new data arrives, the stale
session is only closed the next time some request touches the read path
(next dashboard load, or the next ingest call) — a deliberate, documented
trade-off of moving to serverless, not a bug.

### 5.4 API surface

| Method & path | Purpose |
|---|---|
| `POST /api/ingest` | Receives one measurement from the device/simulator |
| `GET /api/latest` | Current snapshot + last 240 measurements (polled ~1.2s) |
| `GET /api/alarms` | Last 50 alarm events (polled ~4s) |
| `GET /api/sessions` | List of sessions with aggregates |
| `GET /api/sessions/:id` | Session detail: full measurement + alarm history |
| `PATCH /api/sessions/:id` | Rename a session |
| `DELETE /api/sessions/:id` | Delete a session (cascades to its measurements/alarms) |
| `GET /api/sessions/:id/export` | CSV export of a session's measurements |

Ingest payload shape:

```json
{
  "rpm": 1450,
  "coolantTemp": 84.0,
  "oilPressure": 3.9,
  "lat": 43.5081,
  "lng": 16.4402,
  "deviceOn": true,
  "ts": 1730000000000
}
```
`rpm`, `coolantTemp`, `oilPressure` are required; `lat`, `lng`, `deviceOn`,
`ts` are optional (server assigns `ts` if omitted).

---

## 6. Real-Time Updates: Why Polling, Not WebSockets/SSE

The first version of this app pushed live updates to the browser with
**Server-Sent Events** (`GET /api/stream`), backed by an in-memory
publish/subscribe list (`lib/bus.ts`). This worked well on a single
long-running Node process, but breaks on Vercel:

- Serverless function instances are ephemeral and don't share memory — a
  browser connected to instance A would never see data ingested via
  instance B.
- Long-lived HTTP connections (SSE, WebSockets) are cut off by serverless
  execution-time limits.

The fix was to delete the SSE endpoint and the in-memory bus entirely, and
have the client **poll** instead:

```ts
// hooks/useLiveData.ts
useEffect(() => {
  async function pollLatest() {
    const r = await fetch("/api/latest", { cache: "no-store" });
    const d = await r.json();
    setSnapshot(d.snapshot);
    setHistory(d.recent.map(/* ... */));
  }
  async function pollAlarms() { /* GET /api/alarms every 4s */ }

  pollLatest(); pollAlarms();
  const t1 = setInterval(pollLatest, 1200);
  const t2 = setInterval(pollAlarms, 4000);
  return () => { clearInterval(t1); clearInterval(t2); };
}, []);
```

A subtlety worth documenting: `@neondatabase/serverless`'s query function
uses the global `fetch()` internally, and Next.js's dev/production fetch
cache will silently cache those calls unless told not to — which made
`/api/latest` appear to return stale data even though the database was
being written correctly. The fix was passing `fetchOptions: { cache:
"no-store" }` when constructing the Neon client, forcing every database
query to bypass Next's fetch cache.

---

## 7. Frontend

### 7.1 Pages (Next.js App Router)

| Route | File | Rendering |
|---|---|---|
| `/` | `app/page.tsx` → `<Dashboard/>` | Client component, live polling |
| `/sessions` | `app/sessions/page.tsx` | Async Server Component, queries `listSessions()`/`sessionStats()` directly |
| `/sessions/:id` | `app/sessions/[id]/page.tsx` | Async Server Component, queries `getSession()` |

All API routes and the two server-component pages are marked
`export const dynamic = "force-dynamic"` — there is no static data to
prerender here, everything is live.

### 7.2 Key components

- **`Gauge`** — SVG dial for one parameter (RPM / coolant temp / oil
  pressure), colored by alarm level, with a small trend arrow (▲/▼/■)
  computed client-side from the recent history window.
- **`LiveCharts`** — three Recharts `LineChart`s (one per parameter) with
  reference lines at the warn/alarm thresholds, fed by the same rolling
  `history` array the gauges use.
- **`MapView`** — React-Leaflet map showing the device's last known GPS fix
  (dashboard) or the full GPS track of a session (session detail page, drawn
  as a `Polyline`).
- **`StatusBar`** — connection/device/engine status pills + "last update"
  timestamp + staleness badge.
- **`AlarmBanner` / `AlarmLog`** — a prominent banner while any parameter is
  in `ALARM`, and a scrollable log of all alarm transitions.
- **`HealthScore`** — a single 0–100 "engine health" number computed
  client-side:

```ts
// lib/health.ts
export function computeHealth(m: Measurement | null, engineRunning: boolean): HealthScore {
  if (!m || !engineRunning) return { score: 100, status: "NOMINAL", label: "" };
  let score = 100;
  for (const key of ["rpm", "coolantTemp", "oilPressure"] as const) {
    const level = evaluate(key, m[key]);
    if (level === "ALARM") score -= 30;
    else if (level === "WARN") score -= 10;
  }
  score = Math.max(0, score);
  if (score >= 80) return { score, status: "NOMINAL", label: "" };
  if (score >= 50) return { score, status: "WARNING", label: "" };
  return { score, status: "CRITICAL", label: "" };
}
```

- **`ThresholdEditor`** — lets the operator override warn/alarm thresholds
  per parameter for the current session (client-side only; does not change
  what the server logs as an alarm event).
- **`SessionCharts` / `SessionDetailTabs` / `SessionLogs`** — session-detail
  page: full-session parameter curves, GPS track, and the alarm/measurement
  log tables.

All "card" surfaces across the app (gauges, charts, map, alarm log, session
stat tiles, …) share one `.panel` CSS class (`app/globals.css`) for a
consistent look, and were made individually resizable via the native CSS
`resize` property (a drag handle in each panel's corner), wrapped in
`@layer components` so Tailwind's `overflow-hidden` utility still wins on
the couple of elements that rely on clipped overflow for their own layout.

### 7.3 State management

No global state library (Redux/Zustand) — state is local to small,
purpose-built hooks:

- **`useLiveData`** — polling, rolling measurement history, alarm log,
  connection/freshness flags, trend computation.
- **`useThresholds`** — client-side threshold overrides (persisted to
  `localStorage`).
- **`useUnitSystem`** — metric/imperial toggle; conversion functions live in
  `lib/units.ts` (e.g. °C↔°F, bar↔PSI) and are applied only at the display
  layer — everything is stored and transmitted in metric units.

### 7.4 Internationalization

Croatian/English toggle. `lib/i18n.ts` holds the translation tables;
`lib/locale.ts` reads the active locale from a cookie for **server**
components (`getServerT()`), while `components/LanguageProvider.tsx` does
the equivalent for client components. All user-facing strings for both
locales are looked up through this `t.<section>.<key>` object rather than
inlined per component.

---

## 8. Simulator (`simulator/simulate.js`)

A standalone Node script that emulates a full engine duty cycle without any
real hardware, POSTing to `/api/ingest` once per second:

```
MIROVANJE (idle) → PALJENJE (starting) → ZAGRIJAVANJE (warm-up)
   → RAD (running, with load changes + occasional injected fault)
   → GAŠENJE (shutdown) → back to MIROVANJE
```

During the `RAD` phase it has a small random chance of injecting a fault
(`OIL_DROP` or `OVERHEAT`) for 8–16 seconds, specifically to exercise the
alarm pipeline end-to-end. It also drifts a GPS position around Split,
Croatia, proportionally to RPM, to exercise the map/track features. Target
server is configurable via `INGEST_URL` so the same simulator (or a real
decoder) can point at `localhost`, a LAN device, or the deployed Vercel URL.

---

## 9. Deployment

Hosted on **Vercel**, database on **Neon Postgres** (provisioned through
Vercel's Storage tab / Marketplace integration, which auto-injects
`POSTGRES_URL` into the project's environment variables — no manual
connection-string management needed once connected).

Deploy steps:
1. Push the repository to GitHub.
2. Vercel → *Add New → Project* → import the repo (Next.js auto-detected).
3. Vercel → *Storage → Create Database → Postgres* (Neon), connect it to the
   project.
4. Deploy — the schema is created automatically on the first request that
   touches the database (`ensureSchema()`), no manual migration step.
5. Point the physical device (or the simulator via `INGEST_URL`) at
   `https://<project>.vercel.app/api/ingest`.

This is a genuine **stateful → stateless architecture migration**, useful as
a discussion point in the paper: the original design (JSON file on disk,
in-memory pub/sub, `setInterval` background watchdog) is exactly how one
would build this for a dedicated always-on box (e.g. running directly on
the Raspberry Pi doing the CAN decoding). Moving it to a serverless host
required identifying every implicit assumption of a long-lived process and
replacing each with a stateless equivalent (external database, client-side
polling, lazily-evaluated watchdog) while keeping the externally observable
behaviour the same.

---

## 10. Known Limitations

- No push notifications — the browser polls, so there is inherent latency
  on the order of ~1.2s (measurements) / ~4s (alarms).
- The staleness watchdog only runs when a request happens to hit a read
  path; if nothing polls the API for a while, a stale session is only
  closed on the next request, not within a fixed real-time bound.
- No data retention/rollup strategy yet — `measurements` grows unbounded
  per session.
- No authentication — the ingest endpoint and dashboard are open to anyone
  with the URL.
