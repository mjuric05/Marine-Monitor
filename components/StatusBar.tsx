"use client";

import { fmtTime } from "@/lib/format";
import type { Snapshot } from "@/lib/types";
import { useLanguage } from "@/components/LanguageProvider";

function Dot({ on, color }: { on: boolean; color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full"
      style={{
        background: on ? color : "var(--line)",
        boxShadow: on ? `0 0 10px ${color}` : "none",
      }}
    />
  );
}

export default function StatusBar({
  snapshot,
  connected,
  fresh,
}: {
  snapshot: Snapshot | null;
  connected: boolean;
  fresh: boolean;
}) {
  const { t } = useLanguage();
  const s = t.status;

  const deviceOn = !!snapshot?.deviceOn && fresh;
  const running = !!snapshot?.engineRunning && fresh;

  return (
    <div className="panel panel-glow flex flex-wrap items-center gap-x-7 gap-y-3 px-5 py-3">
      <div className="flex items-center gap-2">
        <Dot on={connected} color="var(--phosphor)" />
        <span className="label">{s.connection}</span>
        <span className="readout text-sm text-white">
          {connected ? s.connected : s.disconnected}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Dot on={deviceOn} color="var(--ok)" />
        <span className="label">{s.device}</span>
        <span className="readout text-sm text-white">
          {deviceOn ? s.deviceOn : s.deviceOff}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Dot on={running} color={running ? "var(--ok)" : "var(--dim)"} />
        <span className="label">{s.engine}</span>
        <span className="readout text-sm text-white">
          {running ? s.engineActive : s.engineOff}
        </span>
      </div>
      {running && snapshot?.sessionId != null && (
        <div className="flex items-center gap-2">
          <span className="label">{s.session}</span>
          <span className="readout text-sm text-phosphor">
            #{snapshot.sessionId}
          </span>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <span className="label">{s.lastUpdate}</span>
        <span className="readout text-sm text-white">
          {fmtTime(snapshot?.updatedAt)}
        </span>
        {!fresh && snapshot && (
          <span className="readout rounded border border-warn px-2 py-0.5 text-[11px] text-warn">
            {s.noFreshData}
          </span>
        )}
      </div>
    </div>
  );
}
