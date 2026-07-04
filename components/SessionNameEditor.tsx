"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";

interface Props {
  sessionId: number;
  initialName: string | null | undefined;
}

export default function SessionNameEditor({ sessionId, initialName }: Props) {
  const { t } = useLanguage();
  const sd = t.sessionDetail;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialName ?? "");
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function startEdit() {
    setValue(initialName ?? "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function cancel() {
    setEditing(false);
    setValue(initialName ?? "");
  }

  function save() {
    const trimmed = value.trim();
    const newName = trimmed || null;
    setEditing(false);
    startTransition(async () => {
      try {
        await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName }),
        });
        router.refresh();
      } catch {
        /* ignore */
      }
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") save();
    if (e.key === "Escape") cancel();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={save}
          placeholder={sd.addName}
          maxLength={80}
          className="readout rounded border border-phosphor/40 bg-panel2 px-2 py-0.5 text-lg text-white outline-none focus:border-phosphor"
          style={{ minWidth: 180 }}
        />
        <button
          onMouseDown={(e) => { e.preventDefault(); save(); }}
          className="label rounded border border-line px-2 py-0.5 hover:border-phosphor hover:text-phosphor"
        >
          {sd.save}
        </button>
        <button
          onMouseDown={(e) => { e.preventDefault(); cancel(); }}
          className="label rounded border border-line px-2 py-0.5 hover:text-white"
        >
          {sd.cancel}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      disabled={pending}
      className="group flex items-center gap-2 rounded px-1 py-0.5 text-left transition hover:bg-panel2"
      title="Klikni za uređivanje naziva"
    >
      {initialName ? (
        <span className="readout text-xl font-semibold text-white">{initialName}</span>
      ) : (
        <span className="readout text-xl text-dim italic">{sd.addName}</span>
      )}
      <span className="label text-[10px] text-dim/40 transition group-hover:text-dim/80">✎</span>
    </button>
  );
}
