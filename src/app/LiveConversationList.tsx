"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Conversation } from "@/lib/chatwoot";
import { timeAgo, initials, lastMessagePreview } from "@/lib/format";

const POLL_MS = 5000;

const STATUS_LABEL: Record<Conversation["status"], string> = {
  open: "Abierta",
  pending: "Pendiente",
  resolved: "Resuelta",
  snoozed: "Pospuesta",
};

const STATUS_STYLE: Record<Conversation["status"], string> = {
  open: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400",
  resolved: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  snoozed: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400",
};

/**
 * Lista de conversaciones en tiempo real (polling). Se siembra con lo que
 * trae el servidor y refresca cada POLL_MS para mostrar chats nuevos,
 * no-leídos y cambios de estado sin recargar. Pausa si la pestaña no está visible.
 */
export default function LiveConversationList({
  initial,
}: {
  initial: Conversation[];
}) {
  const [conversations, setConversations] = useState<Conversation[]>(initial);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/conversations", { cache: "no-store" });
          if (res.ok) {
            const data = (await res.json()) as { conversations?: Conversation[] };
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
    <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {conversations.map((c) => {
        const sender = c.meta.sender;
        const name = sender?.name?.trim() || `Visitante #${c.id}`;
        const assignee = c.meta.assignee?.name;
        return (
          <li key={c.id}>
            <Link
              href={`/conversations/${c.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {initials(name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {name}
                  </span>
                  {c.unread_count > 0 && (
                    <span className="shrink-0 rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white">
                      {c.unread_count}
                    </span>
                  )}
                </div>
                <p className="truncate text-sm text-zinc-500">
                  {lastMessagePreview(c)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs text-zinc-400">{timeAgo(c.timestamp)}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status]}`}
                >
                  {STATUS_LABEL[c.status]}
                </span>
                {assignee && (
                  <span className="text-xs text-zinc-400">👤 {assignee}</span>
                )}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
