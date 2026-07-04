"use client";

import { useEffect, useState } from "react";
import { fmtDuration } from "@/lib/format";

/** Živi brojač koji pokazuje koliko dugo traje trenutna sesija. */
export default function SessionTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(
    Math.floor((Date.now() - startedAt) / 1000)
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return (
    <span className="readout text-xs text-phosphor" title="Trajanje sesije">
      ⏱ {fmtDuration(elapsed)}
    </span>
  );
}
