# BILJEŠKE — Engine Watch (nadzor brodskog motora)

Radna referenca uz kod. Sažima što je napravljeno, kako se pokreće, kako je
posloženo i što slijedi. Aplikacija je prateći softver uz diplomski rad o
nadzornom sustavu brodskog dizelskog motora (SAE J1939 / CAN).

---

## 1. Što aplikacija radi

- **Uživo nadzor** rada motora: RPM, temperatura rashladne tekućine, tlak ulja.
- **Instrumenti + alarmi**: gauge s pragovima upozorenja (narančasto) i alarma
  (crveno). Za tlak ulja opasnost je NISKA vrijednost; za RPM i temperaturu VISOKA.
- **Grafovi u stvarnom vremenu** za sva tri parametra.
- **Sesije**: automatski se otvara sesija kad motor proradi i zatvara kad se ugasi.
  Bilježe se trajanje, max/prosj. RPM, max temperatura, min tlak ulja i svi uzorci.
- **Krivulje + putanja** po sesiji (graf parametara + GPS trag na karti).
- **Lokacija** uređaja (Arduino/RPi) na karti dok je upaljen.

---

## 2. Pokretanje

Preduvjet: Node.js 18+.

```bash
npm install
npm run dev          # http://localhost:3000
npm run simulate     # drugi terminal — generira realistične podatke
```

Produkcija: `npm run build` pa `npm start`.

### Windows / PowerShell napomena
Ako `npm` javi SecurityError (PSSecurityException), to je PowerShell zaštita:
- riješi jednom: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, ili
- koristi `npm.cmd …`, ili pokreni u Command Promptu (cmd).

---

## 3. Tehnologije

- **Next.js 14 (App Router)** + **React 18** + **TypeScript**
- **Tailwind CSS** (stilovi), **Recharts** (grafovi), **React-Leaflet** (karta)
- Backend: **Next.js Route Handlers** (Node runtime)
- Stvarno vrijeme: **Server-Sent Events (SSE)**
- Pohrana: **JSON datoteka** u `data/` (bez nativnih ovisnosti)

---

## 4. Struktura

```
app/
  page.tsx                 # nadzorna ploča (uživo)
  sessions/page.tsx        # popis sesija
  sessions/[id]/page.tsx   # detalj sesije (krivulje + putanja)
  api/
    ingest/route.ts        # POST mjerenje
    stream/route.ts        # SSE tok uživo
    latest/route.ts        # trenutno stanje + zadnjih 240 mjerenja
    sessions/route.ts      # popis sesija
    sessions/[id]/route.ts # detalj sesije
components/                # Gauge, Dashboard, LiveCharts, SessionCharts, MapView, StatusBar
hooks/useLiveData.ts       # SSE pretplata + povijest u memoriji
lib/
  db.ts                    # JSON store (perzistencija + flush)
  sessions.ts              # logika: ingest, sesije, agregati, upiti
  bus.ts                   # pub/sub u memoriji za SSE
  types.ts                 # zajednički tipovi
  format.ts                # formatiranje brojeva/vremena/koordinata
config/thresholds.ts       # pragovi i skale instrumenata (JEDNO mjesto za izmjene)
simulator/simulate.js      # generator J1939 prometa
data/                      # JSON pohrana (stvara se pri prvom pokretanju)
```

---

## 5. API

| Metoda i putanja          | Opis                                       |
|---------------------------|--------------------------------------------|
| `POST /api/ingest`        | Prima jedno mjerenje (uređaj/simulator).   |
| `GET  /api/stream`        | SSE tok najnovijih snapshotova.            |
| `GET  /api/latest`        | Trenutno stanje + zadnjih 240 mjerenja.    |
| `GET  /api/sessions`      | Popis sesija s agregatima.                 |
| `GET  /api/sessions/:id`  | Detalj sesije s mjerenjima.                |

Format mjerenja (`POST /api/ingest`):
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
`rpm`, `coolantTemp`, `oilPressure` obavezni; `lat/lng/deviceOn/ts` neobavezni.

---

## 6. Podatkovni model (JSON store)

- **device**: `{ deviceOn, openSessionId, updatedAt }` — trenutno stanje.
- **session**: `{ id, startedAt, endedAt, startLat/Lng, endLat/Lng }`
  (agregati max/prosj./min računaju se iz mjerenja na zahtjev).
- **measurement**: `{ id, sessionId, ts, rpm, coolantTemp, oilPressure, lat, lng }`.

Logika paljenja/gašenja: motor "radi" kad je `rpm > RUN_THRESHOLD_RPM` (300).
Prijelaz iz mirovanja u rad otvara sesiju; obrnuto je zatvara.

---

## 7. Ključne odluke

- **JSON umjesto SQLite-a** radi pokretanja bez prevođenja nativnih modula.
  Za produkciju zamijeniti SQLite-om (`better-sqlite3`) ili pravom bazom; sučelje
  u `lib/sessions.ts` (`ingest`, `listSessions`, `getSession`, …) ostaje isto.
- **SSE umjesto WebSocketa** prema pregledniku — jednostavnije, bez dodatnih
  ovisnosti, dovoljno za jednosmjerni tok podataka.
- **Pub/sub u memoriji** (`lib/bus.ts`) radi unutar jednog procesa poslužitelja.

---

## 8. Pragovi (config/thresholds.ts)

| Parametar          | Skala     | Upozorenje | Alarm | Smjer |
|--------------------|-----------|------------|-------|-------|
| RPM                | 0–2500    | 2000       | 2300  | high  |
| Temp. rashladne    | 0–120 °C  | 90         | 98    | high  |
| Tlak ulja          | 0–7 bar   | 2.0        | 1.5   | low   |

`RUN_THRESHOLD_RPM = 300` (granica "motor radi").

---

## 9. Spajanje stvarnog uređaja

Arduino/RPi koji čita CAN i dekodira J1939 šalje isti JSON na `/api/ingest`.
Adresa poslužitelja preko `INGEST_URL`:
```bash
INGEST_URL=http://<ip>:3000/api/ingest node simulator/simulate.js
```
RPi: SocketCAN (`can0`). Arduino: MCP2515 (SPI). Primjeri dekodiranja u diplomskom radu.

---

## 10. Ograničenja / TODO za nastavak

- [ ] Zamjena JSON pohrane bazom (SQLite/Postgres) + strategija zadržavanja podataka.
- [ ] Zvučni alarm i vizualno treperenje kod razine ALARM.
- [ ] Izvoz sesije (CSV/JSON) i ispis izvještaja.
- [ ] Konfiguracija pragova kroz sučelje (umjesto u kodu).
- [ ] Prijava korisnika i zaštita (HTTPS/WSS) za daljinski pristup.
- [ ] Dekodiranje dijagnostičkih poruka J1939 (DM1) i prikaz kodova kvara.
- [ ] Skaliranje na više instanci (vanjski broker, npr. Redis pub/sub).
- [ ] Više parametara (tlak nabijanja, temp. ispuha po cilindrima, opterećenje).

---

## 11. Brza provjera da radi

1. `npm run dev` + `npm run simulate`.
2. Na `/` vrijednosti se miču; pri kvaru iz simulatora vidi se alarm.
3. Nakon što simulator prođe ciklus (mirovanje → rad → gašenje), pod **Sesije**
   pojavi se zapis; klik na sesiju daje krivulje i putanju.

> Savjet: za brže testiranje sesija smanji trajanje faze "RAD" u
> `simulator/simulate.js` (`phaseT > rand(120, 300)` → manji brojevi).
