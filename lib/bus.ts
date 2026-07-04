import type { Snapshot } from "@/lib/types";

// Jednostavan izdavač/pretplatnik (pub/sub) u memoriji procesa.
// Dovoljno za razvoj i jednu instancu poslužitelja. Za više instanci
// koristio bi se vanjski broker (npr. Redis pub/sub) — vidi README.

type Listener = (snap: Snapshot) => void;

declare global {
  // eslint-disable-next-line no-var
  var __marineBus: Set<Listener> | undefined;
  // eslint-disable-next-line no-var
  var __marineLast: Snapshot | undefined;
}

const listeners: Set<Listener> = global.__marineBus ?? new Set();
if (process.env.NODE_ENV !== "production") global.__marineBus = listeners;

export function publish(snap: Snapshot) {
  global.__marineLast = snap;
  for (const l of listeners) {
    try {
      l(snap);
    } catch {
      /* ignoriraj pojedinačne greške pretplatnika */
    }
  }
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function lastSnapshot(): Snapshot | undefined {
  return global.__marineLast;
}
