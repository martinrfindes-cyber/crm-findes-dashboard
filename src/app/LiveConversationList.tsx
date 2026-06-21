"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LeadConversation } from "@/lib/conversation-leads";
import type { LeadTier } from "@/lib/lead";
import { timeAgo, initials, lastMessagePreview } from "@/lib/format";
import { moveLeadTier } from "./actions";

const POLL_MS = 5000;

const STATUS_LABEL: Record<LeadConversation["status"], string> = {
  open: "Abierta",
  pending: "Pendiente",
  resolved: "Resuelta",
  snoozed: "Pospuesta",
};

const STATUS_STYLE: Record<LeadConversation["status"], string> = {
  open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
  resolved: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  snoozed: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400",
};

// Definición de las columnas del tablero (de más frío a más caliente).
const COLUMNS: {
  tier: LeadTier;
  label: string;
  emoji: string;
  header: string;
  badge: string;
  ring: string;
  over: string;
}[] = [
  {
    tier: "frio",
    label: "Frío",
    emoji: "🧊",
    header: "text-sky-700 dark:text-sky-300",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
    ring: "border-sky-200 dark:border-sky-900/60",
    over: "ring-2 ring-sky-400 bg-sky-50/70 dark:bg-sky-950/30",
  },
  {
    tier: "tibio",
    label: "Tibio",
    emoji: "🌤️",
    header: "text-amber-700 dark:text-amber-300",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    ring: "border-amber-200 dark:border-amber-900/60",
    over: "ring-2 ring-amber-400 bg-amber-50/70 dark:bg-amber-950/30",
  },
  {
    tier: "caliente",
    label: "Caliente",
    emoji: "🔥",
    header: "text-red-700 dark:text-red-300",
    badge: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
    ring: "border-red-200 dark:border-red-900/60",
    over: "ring-2 ring-red-400 bg-red-50/70 dark:bg-red-950/30",
  },
];

const BADGE_BY_TIER: Record<LeadTier, string> = {
  frio: COLUMNS[0].badge,
  tibio: COLUMNS[1].badge,
  caliente: COLUMNS[2].badge,
};

// override local: un tier fijado a mano, o "auto" para volver al automático.
type Override = LeadTier | "auto";

/**
 * Tablero de conversaciones por temperatura de lead (Frío / Tibio / Caliente),
 * en tiempo real (polling). Cada chat cae en su columna por el lead score
 * automático, pero la persona a cargo puede **moverlo a mano** arrastrándolo a
 * otra columna (o con el menú ⋯). Ese override se guarda en Chatwoot y prevalece
 * sobre el cálculo automático hasta que se vuelva a "Automático".
 */
export default function LiveConversationList({
  initial,
}: {
  initial: LeadConversation[];
}) {
  const router = useRouter();
  const [conversations, setConversations] = useState<LeadConversation[]>(initial);
  // Overrides aplicados localmente encima de lo que llega del polling, para que
  // el movimiento se vea instantáneo y no parpadee mientras se confirma.
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<LeadTier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draggedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/conversations", { cache: "no-store" });
          if (res.ok) {
            const data = (await res.json()) as {
              conversations?: LeadConversation[];
            };
            if (!cancelled && Array.isArray(data.conversations)) {
              setConversations(data.conversations);
            }
          }
        } catch {
          /* reintenta en el próximo tick */
        }
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    }

    timer = setTimeout(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  function effectiveTier(c: LeadConversation): { tier: LeadTier; manual: boolean } {
    const ov = overrides[c.id];
    if (!ov) return { tier: c.lead.tier, manual: c.lead.manual };
    if (ov === "auto") return { tier: c.lead.tierAuto, manual: false };
    return { tier: ov, manual: true };
  }

  async function move(id: number, target: Override) {
    setError(null);
    setOverrides((prev) => ({ ...prev, [id]: target }));
    const res = await moveLeadTier(id, target === "auto" ? null : target);
    if (!res.ok) {
      // revertir el optimismo
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setError(res.error);
    }
  }

  if (conversations.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        No hay conversaciones todavía.
      </div>
    );
  }

  return (
    <>
      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}
      <p className="mb-3 text-xs text-zinc-400">
        Arrastrá una tarjeta a otra columna —o usá el menú ⋯— para fijar su
        temperatura a mano.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = conversations
            .map((c) => ({ c, ...effectiveTier(c) }))
            .filter((x) => x.tier === col.tier)
            .sort((a, b) => b.c.lead.score - a.c.lead.score);

          return (
            <section
              key={col.tier}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDragEnter={() => setOverCol(col.tier)}
              onDrop={(e) => {
                e.preventDefault();
                const id = Number(e.dataTransfer.getData("text/plain"));
                setOverCol(null);
                setDragId(null);
                if (Number.isInteger(id)) move(id, col.tier);
              }}
              className={`flex flex-col rounded-xl border bg-zinc-50/60 transition-shadow dark:bg-zinc-900/40 ${col.ring} ${
                overCol === col.tier ? col.over : ""
              }`}
            >
              <header className="flex items-center justify-between gap-2 border-b border-inherit px-3 py-2.5">
                <span className={`flex items-center gap-1.5 text-sm font-semibold ${col.header}`}>
                  <span aria-hidden>{col.emoji}</span>
                  {col.label}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${col.badge}`}>
                  {items.length}
                </span>
              </header>

              <div className="flex min-h-[60px] flex-col gap-2 p-2">
                {items.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-zinc-400">
                    Soltá una conversación acá.
                  </p>
                ) : (
                  items.map(({ c, tier, manual }) => (
                    <ConversationCard
                      key={c.id}
                      c={c}
                      tier={tier}
                      manual={manual}
                      dragging={dragId === c.id}
                      onOpen={() => router.push(`/conversations/${c.id}`)}
                      onDragStart={(e) => {
                        draggedRef.current = true;
                        setDragId(c.id);
                        e.dataTransfer.setData("text/plain", String(c.id));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverCol(null);
                        // permitir clicks normales después del drag
                        setTimeout(() => (draggedRef.current = false), 0);
                      }}
                      wasDragged={() => draggedRef.current}
                      onMove={(t) => move(c.id, t)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function ConversationCard({
  c,
  tier,
  manual,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
  wasDragged,
  onMove,
}: {
  c: LeadConversation;
  tier: LeadTier;
  manual: boolean;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  wasDragged: () => boolean;
  onMove: (target: Override) => void;
}) {
  const [menu, setMenu] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    function onDoc(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setMenu(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  const sender = c.meta.sender;
  const name = c.lead.nombre || sender?.name?.trim() || `Visitante #${c.id}`;
  const assignee = c.meta.assignee?.name;

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (wasDragged()) return;
        if (menu) return;
        onOpen();
      }}
      className={`relative rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60 ${
        dragging ? "cursor-grabbing opacity-50" : "cursor-pointer"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {initials(name)}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {name}
          </span>
          {c.unread_count > 0 && (
            <span className="shrink-0 rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white">
              {c.unread_count}
            </span>
          )}
        </div>
        {manual && (
          <span
            title="Movido a mano"
            aria-label="Movido a mano"
            className="shrink-0 text-xs text-zinc-400"
          >
            📌
          </span>
        )}
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold ${BADGE_BY_TIER[tier]}`}
          title={`Lead score${manual ? " (movido a mano)" : ""}`}
        >
          {c.lead.score}
        </span>
        <button
          type="button"
          aria-label="Mover de columna"
          title="Mover de columna"
          onClick={(e) => {
            e.stopPropagation();
            setMenu((v) => !v);
          }}
          className="shrink-0 rounded-md px-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          ⋯
        </button>
      </div>

      <p className="mt-1.5 truncate text-sm text-zinc-500">
        {lastMessagePreview(c)}
      </p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status]}`}
        >
          {STATUS_LABEL[c.status]}
        </span>
        <span className="flex items-center gap-2 text-xs text-zinc-400">
          {assignee && <span>👤 {assignee}</span>}
          {timeAgo(c.timestamp)}
        </span>
      </div>

      {menu && (
        <div className="absolute right-2 top-10 z-20 w-40 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Mover a
          </p>
          {COLUMNS.map((col) => (
            <button
              key={col.tier}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenu(false);
                if (col.tier !== tier || !manual) onMove(col.tier);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                tier === col.tier && manual
                  ? "font-semibold text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              <span aria-hidden>{col.emoji}</span>
              {col.label}
              {tier === col.tier && manual && (
                <span className="ml-auto text-xs text-zinc-400">✓</span>
              )}
            </button>
          ))}
          <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenu(false);
              onMove("auto");
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <span aria-hidden>🤖</span>
            Automático
            {!manual && <span className="ml-auto text-xs text-zinc-400">✓</span>}
          </button>
        </div>
      )}
    </div>
  );
}
