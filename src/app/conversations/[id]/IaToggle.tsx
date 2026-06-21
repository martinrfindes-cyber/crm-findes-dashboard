"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleIa } from "./actions";

/**
 * Interruptor IA / Humano por conversación. Cuando está en "Humano" la IA
 * queda pausada (custom_attribute `ia_pausada=true`) y solo responde el agente.
 */
export default function IaToggle({
  conversationId,
  initialPaused,
}: {
  conversationId: number;
  initialPaused: boolean;
}) {
  const router = useRouter();
  const [paused, setPaused] = useState(initialPaused);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // paused=false → IA activa; paused=true → modo humano.
  const iaActive = !paused;

  function onToggle() {
    const next = !paused;
    setError(null);
    setPaused(next); // optimista
    startTransition(async () => {
      const res = await toggleIa(conversationId, next);
      if (!res.ok) {
        setPaused(!next); // revertir
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={iaActive}
        title={
          iaActive
            ? "La IA responde automáticamente. Clic para pasar a modo Humano."
            : "Modo humano: la IA está pausada. Clic para reactivar la IA."
        }
        className={`group flex items-center gap-2 rounded-full border px-1 py-1 pr-3 text-xs font-medium transition-colors disabled:opacity-60 ${
          iaActive
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        }`}
      >
        <span
          className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
            iaActive ? "bg-emerald-500" : "bg-amber-500"
          }`}
        >
          <span
            className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
              iaActive ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </span>
        {pending ? "Cambiando…" : iaActive ? "IA activa" : "Modo humano"}
      </button>
      {error && <span className="text-[10px] text-red-500">{error}</span>}
    </div>
  );
}
