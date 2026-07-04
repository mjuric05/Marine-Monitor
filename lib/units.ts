// Konverzija mjernih jedinica između metričkog i imperijalnog sustava.

export type UnitSystem = "metric" | "imperial";

type ParamKey = "rpm" | "coolantTemp" | "oilPressure";

export const UNIT_LABELS: Record<ParamKey, Record<UnitSystem, string>> = {
  rpm: { metric: "o/min", imperial: "RPM" },
  coolantTemp: { metric: "°C", imperial: "°F" },
  oilPressure: { metric: "bar", imperial: "PSI" },
};

// Decimalna mjesta za prikaz u odabranom sustavu.
export const DISPLAY_DECIMALS: Record<ParamKey, Record<UnitSystem, number>> = {
  rpm: { metric: 0, imperial: 0 },
  coolantTemp: { metric: 1, imperial: 1 },
  oilPressure: { metric: 1, imperial: 1 },
};

// Korak za tipke +/-.
export const DISPLAY_STEP: Record<ParamKey, Record<UnitSystem, number>> = {
  rpm: { metric: 10, imperial: 10 },
  coolantTemp: { metric: 1, imperial: 2 },
  oilPressure: { metric: 0.1, imperial: 1 },
};

/** Pretvori metričku vrijednost u odabrani sustav za prikaz. */
export function toDisplay(
  key: ParamKey,
  metricVal: number,
  system: UnitSystem
): number {
  if (system === "metric") return metricVal;
  if (key === "coolantTemp")
    return parseFloat(((metricVal * 9) / 5 + 32).toFixed(1));
  if (key === "oilPressure")
    return parseFloat((metricVal * 14.5038).toFixed(1));
  return metricVal; // RPM — nema konverzije
}

/** Pretvori prikaznu vrijednost natrag u metrički sustav (za pohranу). */
export function toMetric(
  key: ParamKey,
  displayVal: number,
  system: UnitSystem
): number {
  if (system === "metric") return displayVal;
  if (key === "coolantTemp")
    return parseFloat((((displayVal - 32) * 5) / 9).toFixed(2));
  if (key === "oilPressure")
    return parseFloat((displayVal / 14.5038).toFixed(3));
  return displayVal; // RPM
}
