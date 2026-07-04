// Konstante vezane uz logiku motora.

/** Koliko ms nakon što RPM padne ispod praga čekamo prije zatvaranja sesije. */
export const ENGINE_STOP_GRACE_MS = 20_000; // 20 sekundi

/**
 * Koliko ms smijemo čekati bez ijednog novog mjerenja dok je sesija otvorena.
 * Ako nema podataka dulje od ovog praga, smatramo da je uređaj isključen
 * i pokrećemo grace period (koji računa od zadnjeg poznatog mjerenja).
 */
export const DEVICE_STALE_MS = 3_000; // 3 sekunde
