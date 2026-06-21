"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { LeadConversation } from "@/lib/conversation-leads";
import type { LeadTier } from "@/lib/lead";
import { timeAgo, initials, lastMessagePreview } from "@/lib/format";

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
}[] = [
  {
    tier: "frio",
    label: "Frío",
    emoji: "🧊",
    header: "text-sky-700 dark:text-sky-300",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
    ring: "border-sky-200 dark:border-sky-900/60",
  },
  {
    tier: "tibio",
    label: "Tibio",
    emoji: "🌤️",
    header: "text-amber-700 dark:text-amber-300",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    ring: "border-amber-200 dark:border-amber-900/60",
  },
  {
    tier: "caliente",
    label: "Caliente",
    emoji: "🔥",
    header: "text-red-700 dark:text-red-300",
    badge: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
    ring: "border-red-200 dark:border-red-900/60",
  },
];

/**
 * Tablero de conversaciones por temperatura de lead (Frío / Tibio / Caliente),
 * en tiempo real (polling). Se siembra con lo que trae el servidor y refresca
 * cada POLL_MS para mover los chats de columna a medida que sube su score, sin
 * recargar. Pausa si la pestaña no está visible.
 */
export default function LiveConversationList({
  initial,
}: {
  initial: LeadConversation[];
}) {
  const [conversations, setConversations] = useState<LeadConversation[]>(initial);

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

  if (conversations.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        No hay conversaciones todavía.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {COLUMNS.map((col) => {
        const items = conversations
          .filter((c) => c.lead.tier === col.tier)
          .sort((a, b) => b.lead.score - a.lead.score);
        return (
          <section
            key={col.tier}
            className={`flex flex-col rounded-xl border bg-zinc-50/60 dark:bg-zinc-900/40 ${col.ring}`}
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

            <div className="flex flex-col gap-2 p-2">
              {items.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-zinc-400">
                  Sin leads en esta columna.
                </p>
              ) : (
                items.map((c) => (
                  <ConversationCard key={c.id} c={c} badge={col.badge} />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ConversationCard({
  c,
  badge,
}: {
  c: LeadConversation;
  badge: string;
}) {
  const sender = c.meta.sender;
  const name = c.lead.nombre || sender?.name?.trim() || `Visitante #${c.id}`;
  const assignee = c.meta.assignee?.name;

  return (
    <Link
      href={`/conversations/${c.id}`}
      className="block rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60"
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
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-bold ${badge}`}
          title="Lead score"
        >
          {c.lead.score}
        </span>
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
    </Link>
  );
}
