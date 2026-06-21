"use client";

import { useEffect, useMemo, useState } from "react";
import type { Message, Sender } from "@/lib/chatwoot";
import { initials } from "@/lib/format";
import { analizarLead, TIER_LABEL, type LeadTier } from "@/lib/lead";
import IaToggle from "./IaToggle";
import ReplyBox from "./ReplyBox";
import LiveThread from "./LiveThread";

const POLL_MS = 4000;

const STATUS_LABEL: Record<string, string> = {
  open: "Abierta",
  pending: "Pendiente",
  resolved: "Resuelta",
  snoozed: "Pospuesta",
};

const TIER_STYLE: Record<string, string> = {
  caliente:
    "bg-red-100 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900",
  tibio:
    "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900",
  frio:
    "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900",
};

/** Une mensajes dedupeando por id y los deja ordenados por fecha. */
function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return prev;
  const map = new Map<number, Message>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.created_at - b.created_at);
}

/**
 * Vista de conversación en vivo. Es dueña del estado de mensajes y hace el
 * polling cada POLL_MS; a partir de ese estado renderiza el hilo
 * ({@link LiveThread}) y recalcula el lead scoring en vivo, de modo que el
 * panel del lead sube de tier en cuanto el visitante deja nombre/WhatsApp/correo
 * sin necesidad de recargar la página.
 */
export default function ConversationView({
  conversationId,
  initialMessages,
  sender,
  status,
  iaPaused,
  leadAttrs,
  tierOverride,
  fallbackName,
}: {
  conversationId: number;
  initialMessages: Message[];
  sender?: Sender;
  status: string;
  iaPaused: boolean;
  leadAttrs: { key: string; label: string; value: string }[];
  tierOverride?: LeadTier;
  fallbackName: string;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [live, setLive] = useState(true);
  const [showSheet, setShowSheet] = useState(false);

  // Fusiona los mensajes que vuelve a mandar el servidor (p.ej. tras enviar
  // una respuesta y router.refresh()).
  useEffect(() => {
    setMessages((prev) => mergeMessages(prev, initialMessages));
  }, [initialMessages]);

  // Polling al endpoint de mensajes. Pausa si la pestaña no está visible.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch(
            `/api/conversations/${conversationId}/messages`,
            { cache: "no-store" },
          );
          if (res.ok) {
            const data = (await res.json()) as { messages?: Message[] };
            if (!cancelled && Array.isArray(data.messages)) {
              setMessages((prev) => mergeMessages(prev, data.messages!));
              setLive(true);
            }
          } else if (!cancelled) {
            setLive(false);
          }
        } catch {
          if (!cancelled) setLive(false);
        }
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    }

    timer = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [conversationId]);

  // Lead scoring recalculado en vivo a partir de los mensajes actuales.
  const lead = useMemo(
    () => analizarLead(messages, sender),
    [messages, sender],
  );

  // Tier efectivo: el override manual (si la persona lo movió en el tablero)
  // prevalece sobre el automático. El score sigue siendo el calculado.
  const tier = tierOverride ?? lead.tier;
  const name = sender?.name?.trim() || fallbackName;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Hilo de mensajes */}
      <section className="flex min-w-0 flex-1 flex-col">
        {/* Encabezado de la conversación */}
        <div className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {initials(name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {name}
            </p>
            <p className="text-xs text-zinc-500">
              {STATUS_LABEL[status] ?? status} · #{conversationId}
            </p>
          </div>
          <IaToggle conversationId={conversationId} initialPaused={iaPaused} />
        </div>

        {/* Mensajes (tiempo real vía polling, Fase D) */}
        <LiveThread messages={messages} live={live} />

        {/* Pie: responder como humano */}
        <ReplyBox conversationId={conversationId} iaActive={!iaPaused} />
      </section>

      {/* Panel del lead */}
      <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-zinc-200 bg-white p-4 lg:flex dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Lead
          </h2>
          <button
            type="button"
            onClick={() => setShowSheet((v) => !v)}
            aria-expanded={showSheet}
            title="Ver datos en formato tabla"
            className="flex w-full items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-base font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {initials(lead.nombre || name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {lead.nombre || name}
              </p>
              {lead.email && (
                <p className="truncate text-xs text-zinc-500">{lead.email}</p>
              )}
              {lead.telefono && (
                <p className="truncate text-xs text-zinc-500">{lead.telefono}</p>
              )}
            </div>
            <span
              className={`shrink-0 text-zinc-400 transition-transform ${showSheet ? "rotate-180" : ""}`}
              aria-hidden
            >
              ▾
            </span>
          </button>

          {/* Datos del lead en formato hoja (estilo Excel) */}
          {showSheet && (
            <table className="mt-2 w-full table-fixed border-collapse text-xs">
              <tbody>
                {[
                  {
                    label: "Nombre / Empresa",
                    value: lead.nombre || (name.startsWith("Visitante #") ? null : name),
                  },
                  { label: "Teléfono", value: lead.telefono },
                  { label: "Correo", value: lead.email },
                  {
                    label: "Curso de interés",
                    value: lead.intereses.length ? lead.intereses.join(", ") : null,
                  },
                ].map((row) => (
                  <tr key={row.label}>
                    <th className="w-2/5 border border-zinc-200 bg-zinc-100 px-2 py-1.5 text-left align-top font-semibold uppercase tracking-wide text-[10px] text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
                      {row.label}
                    </th>
                    <td className="border border-zinc-200 px-2 py-1.5 align-top text-zinc-800 dark:border-zinc-700 dark:text-zinc-200">
                      {row.value ? (
                        <span className="break-words">{row.value}</span>
                      ) : (
                        <span className="text-zinc-300 dark:text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Lead score (Fase 3) */}
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Lead score
          </h2>
          <div className="flex items-center gap-3">
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold ring-1 transition-all duration-500 ${TIER_STYLE[tier]}`}
            >
              {lead.score}
            </span>
            <div className="min-w-0">
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 transition-colors duration-500 ${TIER_STYLE[tier]}`}
              >
                {TIER_LABEL[tier]}
              </span>
              <p className="mt-1 text-[11px] text-zinc-400">
                de 100{tierOverride ? " · 📌 movido a mano" : ""}
              </p>
            </div>
          </div>
          {lead.razones.length > 0 && (
            <ul className="mt-2 space-y-1">
              {lead.razones.map((r) => (
                <li
                  key={r.texto}
                  className="flex items-center justify-between gap-2 text-xs text-zinc-500"
                >
                  <span className="truncate">{r.texto}</span>
                  <span className="shrink-0 font-medium text-zinc-400">
                    +{r.puntos}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Interés detectado (Fase 3) */}
        {lead.intereses.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Interés detectado
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {lead.intereses.map((i) => (
                <span
                  key={i}
                  className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                >
                  {i}
                </span>
              ))}
            </div>
          </div>
        )}

        {leadAttrs.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Datos capturados
            </h2>
            <dl className="space-y-2">
              {leadAttrs.map((f) => (
                <div key={f.key}>
                  <dt className="text-xs text-zinc-400">{f.label}</dt>
                  <dd className="text-sm text-zinc-800 dark:text-zinc-200">
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </aside>
    </div>
  );
}
