"use client";

import dynamic from "next/dynamic";
import { useLiveData } from "@/hooks/useLiveData";
import { useThresholds } from "@/hooks/useThresholds";
import { useUnitSystem } from "@/hooks/useUnitSystem";
import { useLanguage } from "@/components/LanguageProvider";
import { PARAMS } from "@/config/thresholds";
import { fmtCoord } from "@/lib/format";
import { computeHealth } from "@/lib/health";
import { toDisplay, UNIT_LABELS, DISPLAY_DECIMALS } from "@/lib/units";
import Gauge from "@/components/Gauge";
import StatusBar from "@/components/StatusBar";
import LiveCharts from "@/components/LiveCharts";
import AlarmBanner from "@/components/AlarmBanner";
import AlarmLog from "@/components/AlarmLog";
import HealthScoreWidget from "@/components/HealthScore";
import SessionTimer from "@/components/SessionTimer";
import ThresholdEditor from "@/components/ThresholdEditor";
import EngineStopCountdown from "@/components/EngineStopCountdown";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="grid h-[250px] place-items-center rounded-xl border border-line text-dim text-sm">
      Učitavanje karte…
    </div>
  ),
});

export default function Dashboard() {
  const { snapshot, history, alarmEvents, connected, fresh, trends } = useLiveData();
  const { thresholds, updateAll } = useThresholds();
  const { system: unitSystem, toggle: toggleUnit } = useUnitSystem();
  const { t } = useLanguage();
  const d = t.dashboard;

  const last = snapshot?.last ?? null;
  const active = !!snapshot?.engineRunning && fresh;
  const isGracePeriod = snapshot?.engineStoppingAt != null;
  const showLastValues = active || isGracePeriod;

  const metricVals = {
    rpm:         showLastValues ? (last?.rpm ?? 0) : 0,
    coolantTemp: showLastValues ? (last?.coolantTemp ?? 0) : 0,
    oilPressure: showLastValues ? (last?.oilPressure ?? 0) : 0,
  };

  const displayVals = {
    rpm:         toDisplay("rpm",         metricVals.rpm,         unitSystem),
    coolantTemp: toDisplay("coolantTemp",  metricVals.coolantTemp,  unitSystem),
    oilPressure: toDisplay("oilPressure",  metricVals.oilPressure,  unitSystem),
  };

  const health = computeHealth(active ? last : null, active);
  health.label = active
    ? health.status === "NOMINAL" ? t.health.labelNominal
      : health.status === "WARNING" ? t.health.labelWarning
      : t.health.labelCritical
    : t.health.labelInactive;

  const pos =
    last?.lat != null && last?.lng != null
      ? { lat: last.lat, lng: last.lng }
      : null;

  return (
    <div className="space-y-4">
      <AlarmBanner alarmEvents={alarmEvents} engineRunning={active} />

      {snapshot?.engineStoppingAt != null && (
        <EngineStopCountdown stoppingAt={snapshot.engineStoppingAt} />
      )}

      <StatusBar snapshot={snapshot} connected={connected} fresh={fresh} />

      {/* Gaugeovi */}
      <section className="grid gap-4 sm:grid-cols-3">
        {(["rpm", "coolantTemp", "oilPressure"] as const).map((k) => (
          <Gauge
            key={k}
            config={PARAMS[k]}
            value={metricVals[k]}
            displayValue={displayVals[k]}
            displayUnit={UNIT_LABELS[k][unitSystem]}
            active={active}
            trend={trends[k]}
            thresholds={thresholds[k]}
          />
        ))}
      </section>

      {/* Pragovi alarma — odmah ispod gaugeova */}
      <ThresholdEditor
        thresholds={thresholds}
        unitSystem={unitSystem}
        onToggleUnit={toggleUnit}
        onConfirm={updateAll}
      />

      {/* Grafovi */}
      <section>
        <h2 className="label mb-3">{d.liveCharts}</h2>
        <LiveCharts data={history} thresholds={thresholds} />
      </section>

      {/* Donji red */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Karta */}
        <div className="panel panel-glow p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="label">{d.location}</h2>
            <span className="readout text-xs text-dim">
              {fmtCoord(pos?.lat ?? null, pos?.lng ?? null)}
            </span>
          </div>
          <MapView position={pos} follow height={250} />
          {!pos && <p className="mt-3 text-sm text-dim">{d.noLocation}</p>}
        </div>

        {/* Odčitaj + zdravlje */}
        <div className="panel panel-glow p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="label">{d.readout}</h2>
            {active && snapshot?.sessionStartedAt != null && (
              <SessionTimer startedAt={snapshot.sessionStartedAt} />
            )}
          </div>
          <div className="mb-4 rounded-lg border border-line/50 bg-ink/40 p-3">
            <div className="label mb-2">{t.health.title}</div>
            <HealthScoreWidget health={health} />
          </div>
          <dl className="space-y-3">
            {(["rpm", "coolantTemp", "oilPressure"] as const).map((k) => (
              <div key={k} className="flex items-baseline justify-between border-b border-line pb-2">
                <dt className="text-sm text-dim">{t.params[k].label}</dt>
                <dd className="readout text-lg text-white">
                  {displayVals[k].toFixed(DISPLAY_DECIMALS[k][unitSystem])}{" "}
                  <span className="text-xs text-dim">{UNIT_LABELS[k][unitSystem]}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs leading-relaxed text-dim">
            {d.sessionNote}{" "}
            <a href="/sessions" className="text-phosphor underline">{d.sessionsLink}</a>
          </p>
        </div>

        {/* Alarm log */}
        <div className="panel panel-glow p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="label">{t.alarm.title}</h2>
            {alarmEvents.filter((e) => e.to === "ALARM").length > 0 && (
              <span className="readout rounded-full border border-alarm/30 bg-alarm/10 px-2 py-0.5 text-[11px] text-alarm">
                {alarmEvents.filter((e) => e.to === "ALARM").length}×
              </span>
            )}
          </div>
          <AlarmLog events={alarmEvents} />
        </div>
      </section>
    </div>
  );
}
