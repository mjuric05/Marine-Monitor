"use client";

import { useEffect, useState } from "react";
import { ENGINE_STOP_GRACE_MS } from "@/config/engine";
import { useLanguage } from "@/components/LanguageProvider";

export default function EngineStopCountdown({ stoppingAt }: { stoppingAt: number }) {
  const { t } = useLanguage();
  const totalSec = ENGINE_STOP_GRACE_MS / 1000;

  const calc = () =>
    Math.max(0, (ENGINE_STOP_GRACE_MS - (Date.now() - stoppingAt)) / 1000);

  const [remaining, setRemaining] = useState(calc);

  useEffect(() => {
    const id = setInterval(() => setRemaining(calc()), 250);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stoppingAt]);

  const secs = Math.ceil(remaining);
  const pct = remaining / totalSec;

  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-xl border px-5 py-3"
      style={{
        borderColor: "rgba(245,166,35,0.40)",
        background: "rgba(245,166,35,0.06)",
        boxShadow: "0 0 0 1px rgba(245,166,35,0.08), 0 0 20px rgba(245,166,35,0.06)",
      }}
    >
      <div className="flex flex-1 items-center gap-3">
        <span
          className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-warn"
          style={{ boxShadow: "0 0 10px var(--warn)", animation: "blink 1s steps(2,start) infinite" }}
        />
        <span className="readout text-sm font-semibold text-warn">
          {t.dashboard.engineStopped}
        </span>
        <span className="text-sm text-dim">— {t.dashboard.graceNote}</span>
        <span
          className="readout text-xl font-bold tabular-nums"
          style={{ color: "var(--warn)", minWidth: "2.5ch", textAlign: "right" }}
        >
          {secs}s
        </span>
      </div>
      <div className="w-40 flex-shrink-0">
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-warn"
            style={{ width: `${pct * 100}%`, transition: "width 0.25s linear", boxShadow: "0 0 6px var(--warn)" }}
          />
        </div>
        <div className="label mt-1 text-center text-[9px] text-dim/60">
          {t.dashboard.graceClosing} {secs}s
        </div>
      </div>
    </div>
  );
}
