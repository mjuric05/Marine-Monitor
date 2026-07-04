#!/usr/bin/env node
/*
 * Simulator brodskog dizelskog motora.
 * Generira realistične vrijednosti (RPM, temperatura, tlak ulja) i GPS putanju,
 * te ih šalje na /api/ingest. Oponaša ciklus: paljenje → zagrijavanje → rad →
 * promjene opterećenja → (povremeni događaj) → gašenje → mirovanje.
 *
 * Pokretanje:   node simulator/simulate.js
 * Okolina:      INGEST_URL (zadano http://localhost:3000/api/ingest)
 *
 * Na stvarnom uređaju (Arduino/RPi) ovu ulogu preuzima sloj prikupljanja koji
 * dekodira J1939 okvire i šalje isti JSON na isti endpoint.
 */

const INGEST_URL = process.env.INGEST_URL || "http://localhost:3000/api/ingest";
const PERIOD_MS = 1000;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (a, b) => a + Math.random() * (b - a);

// Stanja motora.
const PHASES = ["MIROVANJE", "PALJENJE", "ZAGRIJAVANJE", "RAD", "GASENJE"];

let phase = "MIROVANJE";
let phaseT = 0; // sekunde u trenutnoj fazi
let rpm = 0;
let temp = 20; // °C, kreće od ambijentalne
let oil = 0; // bar
let load = 0.4; // 0..1 ciljano opterećenje

// GPS: lagana plovidba oko Splita.
let lat = 43.5081 + rand(-0.01, 0.01);
let lng = 16.4402 + rand(-0.01, 0.01);
let heading = rand(0, 2 * Math.PI);

let injectEvent = null; // {type, t}

function step(dt) {
  phaseT += dt;

  switch (phase) {
    case "MIROVANJE":
      rpm = 0;
      oil = 0;
      temp = Math.max(20, temp - 0.1 * dt); // hladi se prema ambijentu
      if (phaseT > rand(4, 8)) next("PALJENJE");
      break;

    case "PALJENJE":
      rpm = clamp(rpm + 350 * dt, 0, 800);
      oil = clamp(oil + 2.5 * dt, 0, 4.5);
      if (rpm >= 750) next("ZAGRIJAVANJE");
      break;

    case "ZAGRIJAVANJE":
      rpm = clamp(rpm + rand(-30, 30), 750, 950);
      temp = clamp(temp + rand(0.6, 1.2) * dt, 20, 80);
      oil = clamp(4.5 + rand(-0.2, 0.2), 3.5, 5.0);
      if (temp >= 78) next("RAD");
      break;

    case "RAD": {
      // Povremeno mijenjaj ciljano opterećenje.
      if (Math.random() < 0.02) load = clamp(rand(0.3, 1.0), 0.2, 1.0);
      const targetRpm = 800 + load * 1200; // 800..2000
      rpm = clamp(rpm + (targetRpm - rpm) * 0.1 + rand(-25, 25), 700, 2100);
      const targetTemp = 78 + load * 14; // 78..92
      temp = clamp(temp + (targetTemp - temp) * 0.05 + rand(-0.2, 0.2), 60, 110);
      oil = clamp(3.2 + load * 1.6 + rand(-0.15, 0.15), 1.0, 6.0);

      // Povremeni kritični događaj (pad tlaka ulja / pregrijavanje).
      if (!injectEvent && Math.random() < 0.004) {
        injectEvent = {
          type: Math.random() < 0.5 ? "OIL_DROP" : "OVERHEAT",
          t: 0,
        };
        console.log("⚠️  ubacujem događaj:", injectEvent.type);
      }
      if (injectEvent) {
        injectEvent.t += dt;
        if (injectEvent.type === "OIL_DROP") oil = clamp(oil - 0.6, 0.4, 6);
        if (injectEvent.type === "OVERHEAT") temp = clamp(temp + 1.2 * dt, 60, 108);
        if (injectEvent.t > rand(8, 16)) injectEvent = null;
      }

      if (phaseT > rand(120, 300)) next("GASENJE");
      break;
    }

    case "GASENJE":
      rpm = clamp(rpm - 500 * dt, 0, 2100);
      oil = clamp(oil - 1.5 * dt, 0, 6);
      if (rpm <= 0) {
        rpm = 0;
        next("MIROVANJE");
      }
      break;
  }

  // Pomak GPS-a samo dok motor radi.
  if (rpm > 300) {
    heading += rand(-0.08, 0.08);
    const speed = (rpm / 2000) * 0.00012; // grubo, ~ proporcionalno RPM-u
    lat += Math.cos(heading) * speed;
    lng += Math.sin(heading) * speed;
  }
}

function next(p) {
  phase = p;
  phaseT = 0;
  console.log("→ faza:", p);
}

async function tick() {
  step(PERIOD_MS / 1000);
  const deviceOn = true; // uređaj je upaljen cijelo vrijeme simulacije
  const payload = {
    rpm: Math.round(rpm),
    coolantTemp: +temp.toFixed(1),
    oilPressure: +oil.toFixed(2),
    lat: +lat.toFixed(6),
    lng: +lng.toFixed(6),
    deviceOn,
    ts: Date.now(),
  };

  try {
    const res = await fetch(INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error("ingest greška:", res.status);
  } catch (e) {
    console.error("ne mogu doseći poslužitelj:", e.message);
  }

  process.stdout.write(
    `\r${phase.padEnd(11)} rpm=${String(payload.rpm).padStart(4)} ` +
      `temp=${payload.coolantTemp}°C oil=${payload.oilPressure}bar   `
  );
}

console.log("Simulator pokrenut →", INGEST_URL);
console.log("Zaustavljanje: Ctrl+C\n");
setInterval(tick, PERIOD_MS);
