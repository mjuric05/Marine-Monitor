# Engine Watch — nadzor brodskog dizelskog motora

Full-stack **Next.js + React** web aplikacija za nadzor rada brodskog dizelskog
motora u stvarnom vremenu. Prati **broj okretaja (RPM)**, **temperaturu rashladne
tekućine** i **tlak ulja**, automatski bilježi **sesije** (paljenje → gašenje) s
krivuljama parametara te prikazuje **lokaciju uređaja** (Arduino/Raspberry Pi) na
karti dok je upaljen.

Aplikacija je izrađena kao prateći softver uz diplomski rad o nadzornom sustavu
brodskog motora temeljenom na protokolu **SAE J1939 / CAN**.

---

## Mogućnosti

- **Nadzorna ploča uživo** — instrumenti (gauge) s pragovima upozorenja/alarma,
  grafovi parametara u stvarnom vremenu, status uređaja i motora, karta lokacije.
- **Sesije rada** — sustav automatski otvara sesiju kada motor proradi i zatvara
  je kada se ugasi; za svaku sesiju računa trajanje, maks./prosj. RPM, maks.
  temperaturu i min. tlak ulja.
- **Krivulje i putanja** — detalj svake sesije prikazuje krivulje sva tri
  parametra kroz vrijeme te GPS putanju na karti.
- **Lokacija** — posljednja poznata GPS pozicija uređaja dok je upaljen.
- **Stvarni promet** — podatci stižu na `POST /api/ingest`, a pregledniku se
  guraju kroz **Server-Sent Events** (`/api/stream`).
- **Simulator** — ugrađeni generator realističnog J1939 prometa za rad bez
  stvarnog motora.

---

## Tehnologije

| Sloj            | Tehnologija                                   |
|-----------------|-----------------------------------------------|
| Frontend        | Next.js 14 (App Router), React 18, TypeScript |
| Stilovi         | Tailwind CSS                                  |
| Grafovi         | Recharts                                      |
| Karta           | React-Leaflet + OpenStreetMap (CARTO dark)    |
| Backend         | Next.js Route Handlers (Node.js runtime)      |
| Stvarno vrijeme | Server-Sent Events (SSE)                      |
| Pohrana         | JSON datoteka (bez nativnih ovisnosti)        |

> **Napomena o bazi:** radi jednostavnog pokretanja (bez prevođenja nativnih
> modula) perzistencija koristi laganu JSON datoteku u `data/`. Za produkciju ili
> veće količine podataka preporuča se zamjena SQLite-om (npr. `better-sqlite3`)
> ili pravom bazom — vidi `lib/db.ts` i `lib/sessions.ts`; sučelje (funkcije
> `ingest`, `listSessions`, `getSession`, …) ostaje isto.

---

## Pokretanje

Potreban je **Node.js 18+**.

```bash
npm install
npm run dev
```

Aplikacija je na **http://localhost:3000**.

U drugom terminalu pokreni simulator da vidiš podatke uživo:

```bash
npm run simulate
```

Simulator oponaša cijeli ciklus (paljenje, zagrijavanje, rad uz promjene
opterećenja, povremeni kvar, gašenje) i šalje podatke na `/api/ingest`.

### Produkcijski build

```bash
npm run build
npm start
```

---

## Spajanje stvarnog uređaja (Arduino / Raspberry Pi)

Uređaj koji čita CAN sabirnicu i dekodira J1939 poruke šalje mjerenja na isti
endpoint kao i simulator:

```
POST /api/ingest
Content-Type: application/json

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

- `rpm`, `coolantTemp`, `oilPressure` — obavezni (brojevi).
- `lat`, `lng` — neobavezni (GPS); ako se izostave, lokacija se ne crta.
- `deviceOn` — je li uređaj upaljen (zadano `true`).
- `ts` — vremenska oznaka u ms; ako se izostavi, postavlja je poslužitelj.

Na Raspberry Piju se CAN obično čita preko **SocketCAN** (`can0`), a na Arduinu
preko modula **MCP2515** (SPI). Primjer dekodiranja nalazi se u pratećem
diplomskom radu. Postavi adresu poslužitelja preko `INGEST_URL`:

```bash
INGEST_URL=http://<ip-poslužitelja>:3000/api/ingest node simulator/simulate.js
```

---

## API

| Metoda i putanja            | Opis                                          |
|-----------------------------|-----------------------------------------------|
| `POST /api/ingest`          | Prima jedno mjerenje (uređaj/simulator).      |
| `GET  /api/stream`          | SSE tok najnovijih snapshotova uživo.         |
| `GET  /api/latest`          | Trenutno stanje + posljednjih 240 mjerenja.   |
| `GET  /api/sessions`        | Popis sesija s agregatima.                    |
| `GET  /api/sessions/:id`    | Detalj sesije s mjerenjima.                    |

---

## Struktura projekta

```
app/
  page.tsx                 # nadzorna ploča (uživo)
  sessions/page.tsx        # popis sesija
  sessions/[id]/page.tsx   # detalj sesije (krivulje + putanja)
  api/                     # ingest, stream (SSE), latest, sessions
components/                # Gauge, Dashboard, LiveCharts, MapView, StatusBar, …
hooks/useLiveData.ts       # SSE pretplata + povijest mjerenja
lib/                       # db (JSON store), sessions (logika), bus (SSE), tipovi
config/thresholds.ts       # pragovi parametara i skale instrumenata
simulator/simulate.js      # generator J1939 prometa
data/                      # JSON pohrana (stvara se pri prvom pokretanju)
```

---

## Prilagodba pragova

Pragovi upozorenja/alarma i skale instrumenata definirani su na jednom mjestu u
`config/thresholds.ts`. Za tlak ulja niske vrijednosti znače opasnost
(`direction: "low"`), dok za RPM i temperaturu opasnost znače visoke vrijednosti.

---

## Ograničenja

- SSE i pub/sub rade unutar jednog procesa poslužitelja. Za više instanci koristi
  se vanjski broker (npr. Redis pub/sub).
- JSON pohrana je namijenjena prototipu; za dugotrajan rad uvedi bazu i strategiju
  zadržavanja (sažimanje starih podataka).
