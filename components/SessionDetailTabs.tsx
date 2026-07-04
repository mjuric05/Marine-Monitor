"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import SessionCharts from "@/components/SessionCharts";
import SessionLogs from "@/components/SessionLogs";
import type { SessionDetail } from "@/lib/types";
import { useLanguage } from "@/components/LanguageProvider";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[280px] place-items-center rounded-xl border border-line text-dim text-sm">
      Učitavanje karte…
    </div>
  ),
});

type Tab = "charts" | "logs";

interface Props {
  session: SessionDetail;
  track: { lat: number; lng: number }[];
  startPos: { lat: number; lng: number } | null;
}

export default function SessionDetailTabs({ session, track, startPos }: Props) {
  const { t } = useLanguage();
  const sd = t.sessionDetail;
  const [tab, setTab] = useState<Tab>("charts");

  return (
    <div className="space-y-4">
      {/* Tab traka */}
      <div className="flex gap-1 rounded-xl border border-line bg-panel p-1" style={{ width: "fit-content" }}>
        <TabButton active={tab === "charts"} onClick={() => setTab("charts")}>
          {sd.chartsTab}
        </TabButton>
        <TabButton active={tab === "logs"} onClick={() => setTab("logs")}>
          {sd.logsTab}
          {session.alarmEvents.some((e) => e.to === "ALARM") && (
            <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-alarm" />
          )}
        </TabButton>
      </div>

      {tab === "charts" && (
        <div className="space-y-4">
          {session.measurements.length > 1 ? (
            <SessionCharts measurements={session.measurements} />
          ) : (
            <div className="panel panel-glow p-6 text-center text-dim">{sd.noCharts}</div>
          )}
          <div className="panel panel-glow p-4">
            <h2 className="label mb-3">{sd.trackTitle}</h2>
            {track.length > 0 ? (
              <MapView position={startPos} track={track} height={340} />
            ) : (
              <p className="py-6 text-center text-dim">{sd.noGps}</p>
            )}
          </div>
        </div>
      )}

      {tab === "logs" && <SessionLogs session={session} />}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="readout flex items-center rounded-lg px-4 py-1.5 text-sm transition"
      style={
        active
          ? { background: "rgba(95,230,201,0.1)", color: "var(--phosphor)", boxShadow: "inset 0 0 0 1px rgba(95,230,201,0.2)" }
          : { color: "var(--dim)" }
      }
    >
      {children}
    </button>
  );
}
