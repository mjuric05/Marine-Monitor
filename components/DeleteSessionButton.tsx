"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";

interface Props {
  sessionId: number;
  /** Ako je true, redirect na /sessions nakon brisanja (za stranicu detalja). */
  redirectAfter?: boolean;
}

export default function DeleteSessionButton({ sessionId, redirectAfter }: Props) {
  const { t } = useLanguage();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (redirectAfter) {
        router.push("/sessions");
      } else {
        router.refresh();
      }
    } catch {
      setLoading(false);
      setConfirm(false);
    }
  }

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        title={t.sessions.deleteTitle}
        className="rounded-md border border-line px-3 py-1.5 text-sm text-dim transition hover:border-alarm/50 hover:text-alarm"
      >
        {t.general.deleteBtn}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-alarm/40 bg-alarm/5 px-3 py-1.5">
      <span className="readout text-xs text-alarm">
        {t.sessions.deleteConfirm}{sessionId}{t.sessions.deleteConfirmSuffix}
      </span>
      <button
        onClick={handleDelete}
        disabled={loading}
        className="readout rounded border border-alarm/50 bg-alarm/10 px-2.5 py-1 text-xs text-alarm transition hover:bg-alarm/20 disabled:opacity-50"
      >
        {loading ? t.sessions.deleting : t.general.deleteBtn}
      </button>
      <button
        onClick={() => setConfirm(false)}
        disabled={loading}
        className="label px-2 py-1 text-[10px] text-dim hover:text-white"
      >
        {t.thresholds.cancel}
      </button>
    </div>
  );
}
