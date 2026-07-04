"use client";

import { useEffect, useRef, useState } from "react";
import { PARAMS } from "@/config/thresholds";
import type { CustomThresholds } from "@/hooks/useThresholds";
import type { UnitSystem } from "@/lib/units";
import { toDisplay, toMetric, UNIT_LABELS, DISPLAY_STEP, DISPLAY_DECIMALS } from "@/lib/units";
import { useLanguage } from "@/components/LanguageProvider";

const PARAM_KEYS = ["rpm", "coolantTemp", "oilPressure"] as const;
type ParamKey = (typeof PARAM_KEYS)[number];
type Field = "warn" | "alarm";
type ParamDisplay = { warn: number; alarm: number };
type DisplayAll = Record<ParamKey, ParamDisplay>;

function toDisplayAll(t: CustomThresholds, sys: UnitSystem): DisplayAll {
  const r = {} as DisplayAll;
  for (const k of PARAM_KEYS) {
    r[k] = { warn: toDisplay(k, t[k].warn, sys), alarm: toDisplay(k, t[k].alarm, sys) };
  }
  return r;
}

function toMetricAll(d: DisplayAll, sys: UnitSystem): CustomThresholds {
  return {
    rpm:         { warn: toMetric("rpm",         d.rpm.warn,         sys), alarm: toMetric("rpm",         d.rpm.alarm,         sys) },
    coolantTemp: { warn: toMetric("coolantTemp",  d.coolantTemp.warn,  sys), alarm: toMetric("coolantTemp",  d.coolantTemp.alarm,  sys) },
    oilPressure: { warn: toMetric("oilPressure",  d.oilPressure.warn,  sys), alarm: toMetric("oilPressure",  d.oilPressure.alarm,  sys) },
  };
}

interface Props {
  thresholds: CustomThresholds;
  unitSystem: UnitSystem;
  onToggleUnit: () => void;
  onConfirm: (next: CustomThresholds) => void;
}

export default function ThresholdEditor({ thresholds, unitSystem, onToggleUnit, onConfirm }: Props) {
  const { t } = useLanguage();
  const tt = t.thresholds;

  const committed = toDisplayAll(thresholds, unitSystem);
  const [pending, setPending] = useState<DisplayAll | null>(null);
  const [inputStrs, setInputStrs] = useState<Partial<Record<string, string>>>({});

  const current = pending ?? committed;
  const isDirty = pending !== null;

  const prevThresholdsRef = useRef(thresholds);
  const prevUnitRef = useRef(unitSystem);

  useEffect(() => {
    const thresholdsChanged = prevThresholdsRef.current !== thresholds;
    const unitChanged = prevUnitRef.current !== unitSystem;
    if (thresholdsChanged || unitChanged) {
      prevThresholdsRef.current = thresholds;
      prevUnitRef.current = unitSystem;
      setPending(null);
      setInputStrs({});
    }
  }, [thresholds, unitSystem]);

  function getDisplayVal(k: ParamKey, f: Field): number { return current[k][f]; }
  function getStr(k: ParamKey, f: Field): string { return inputStrs[`${k}_${f}`] ?? String(getDisplayVal(k, f)); }

  function clampDisplay(k: ParamKey, v: number): number {
    const p = PARAMS[k];
    const lo = toDisplay(k, p.min, unitSystem);
    const hi = toDisplay(k, p.max, unitSystem);
    return Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), v));
  }

  function commitVal(k: ParamKey, f: Field, v: number) {
    const clamped = clampDisplay(k, v);
    setInputStrs((prev) => ({ ...prev, [`${k}_${f}`]: String(clamped) }));
    setPending((prev) => {
      const base = prev ?? committed;
      return { ...base, [k]: { ...base[k], [f]: clamped } };
    });
  }

  function handleChange(k: ParamKey, f: Field, raw: string) {
    setInputStrs((prev) => ({ ...prev, [`${k}_${f}`]: raw }));
    const n = parseFloat(raw.replace(",", "."));
    if (isFinite(n)) {
      setPending((prev) => {
        const base = prev ?? committed;
        return { ...base, [k]: { ...base[k], [f]: n } };
      });
    }
  }

  function handleBlur(k: ParamKey, f: Field) {
    const raw = inputStrs[`${k}_${f}`] ?? String(getDisplayVal(k, f));
    const n = parseFloat(raw.replace(",", "."));
    commitVal(k, f, isFinite(n) ? n : getDisplayVal(k, f));
  }

  function handleStep(k: ParamKey, f: Field, dir: 1 | -1) {
    const step = DISPLAY_STEP[k][unitSystem];
    const dec = DISPLAY_DECIMALS[k][unitSystem];
    const next = parseFloat((getDisplayVal(k, f) + dir * step).toFixed(dec));
    commitVal(k, f, next);
  }

  return (
    <div className="panel panel-glow overflow-hidden">
      {/* Zaglavlje */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="label">{tt.title}</span>
          {isDirty && (
            <span className="readout rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[10px] text-warn">
              {tt.pending}
            </span>
          )}
        </div>
        {/* Sustav jedinica */}
        <div className="flex overflow-hidden rounded-lg border border-line text-xs" style={{ fontFamily: "var(--font-display)" }}>
          {(["metric", "imperial"] as const).map((s) => (
            <button
              key={s}
              onClick={() => unitSystem !== s && onToggleUnit()}
              className="px-3 py-1.5 transition"
              style={
                unitSystem === s
                  ? { background: "rgba(95,230,201,0.12)", color: "var(--phosphor)", borderRight: s === "metric" ? "1px solid var(--line)" : undefined, borderLeft: s === "imperial" ? "1px solid var(--line)" : undefined }
                  : { color: "var(--dim)" }
              }
            >
              {s === "metric" ? tt.metric : tt.imperial}
            </button>
          ))}
        </div>
      </div>

      {/* Kartice parametara */}
      <div className="grid gap-4 p-5 sm:grid-cols-3">
        {PARAM_KEYS.map((k) => {
          const param = PARAMS[k];
          const unit = UNIT_LABELS[k][unitSystem];
          const paramLabel = t.params[k]?.label ?? param.label;

          return (
            <div key={k} className="rounded-xl border border-line/50 p-4" style={{ background: "rgba(10,14,20,0.5)" }}>
              <div className="label mb-3">{paramLabel}</div>
              {(["warn", "alarm"] as const).map((f) => {
                const color = f === "warn" ? "var(--warn)" : "var(--alarm)";
                const label = f === "warn" ? tt.warn : tt.alarm;

                return (
                  <div key={f} className="mb-3 last:mb-0">
                    <span className="label text-[10px]" style={{ color }}>{label}</span>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <button
                        onClick={() => handleStep(k, f, -1)}
                        className="readout flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border text-base font-bold transition active:scale-95"
                        style={{ borderColor: `${color}50`, color, background: `${color}0d` }}
                        onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.background = `${color}20`)}
                        onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.background = `${color}0d`)}
                      >
                        −
                      </button>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={getStr(k, f)}
                        onChange={(e) => handleChange(k, f, e.target.value)}
                        onBlur={() => handleBlur(k, f)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleBlur(k, f);
                          if (e.key === "ArrowUp") { e.preventDefault(); handleStep(k, f, 1); }
                          if (e.key === "ArrowDown") { e.preventDefault(); handleStep(k, f, -1); }
                        }}
                        className="readout h-8 min-w-0 flex-1 rounded-md border bg-transparent px-2 text-center text-sm text-white outline-none transition focus:ring-1"
                        style={{ borderColor: `${color}40`, background: `${color}06` }}
                      />
                      <button
                        onClick={() => handleStep(k, f, 1)}
                        className="readout flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border text-base font-bold transition active:scale-95"
                        style={{ borderColor: `${color}50`, color, background: `${color}0d` }}
                        onMouseOver={(e) => ((e.currentTarget as HTMLElement).style.background = `${color}20`)}
                        onMouseOut={(e) => ((e.currentTarget as HTMLElement).style.background = `${color}0d`)}
                      >
                        +
                      </button>
                      <span className="label w-10 flex-shrink-0 text-right text-[10px]">{unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Potvrdi / Odustani */}
      {isDirty && (
        <div className="flex items-center justify-between border-t px-5 py-3" style={{ borderColor: "rgba(245,166,35,0.25)", background: "rgba(245,166,35,0.04)" }}>
          <span className="text-xs text-warn/80">{tt.unsaved}</span>
          <div className="flex gap-2">
            <button
              onClick={() => { setPending(null); setInputStrs({}); }}
              className="readout rounded border border-line px-4 py-1.5 text-sm text-dim transition hover:border-white hover:text-white"
            >
              {tt.cancel}
            </button>
            <button
              onClick={() => { if (pending) onConfirm(toMetricAll(pending, unitSystem)); }}
              className="readout rounded border border-phosphor/50 bg-phosphor/10 px-4 py-1.5 text-sm text-phosphor transition hover:bg-phosphor/20"
            >
              {tt.confirm}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
