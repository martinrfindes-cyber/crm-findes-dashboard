"use client";

import { useEffect, useRef, useState } from "react";
import type { Message } from "@/lib/chatwoot";
import { clockTime, dayLabel } from "@/lib/format";

const POLL_MS = 4000;

/** Une mensajes dedupeando por id y los deja ordenados por fecha. */
function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) return prev;
  const map = new Map<number, Message>();
  for (const m of prev) map.set(m.id, m);
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.created_at - b.created_at);
}

/**
 * Hilo de mensajes en tiempo real (Fase D). Se siembra con los mensajes
 * renderizados en el servidor y hace polling cada POLL_MS para traer los
 * nuevos sin recargar la página. Pausa el polling si la pestaña no está visible.
 */
export default function LiveThread({
  conversationId,
  initialMessages,
}: {
  conversationId: number;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [live, setLive] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  // Fusiona los mensajes que vuelve a mandar el servidor (p.ej. tras enviar
  // una respuesta y router.refresh()).
  useEffect(() => {
    setMessages((prev) => mergeMessages(prev, initialMessages));
  }, [initialMessages]);

  // Polling al endpoint de mensajes.
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

  // Auto-scroll: si el usuario está cerca del fondo, seguir los mensajes nuevos.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = distance < 120;
  }

  const visible = messages.filter((m) => m.message_type !== 2 && m.content);

  let lastDay = "";
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="relative flex-1 overflow-y-auto bg-zinc-100 px-4 py-6 dark:bg-zinc-950"
    >
      {/* Indicador de tiempo real */}
      <div className="pointer-events-none sticky top-0 z-10 -mt-2 mb-2 flex justify-center">
        <span
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium shadow-sm ${
            live
              ? "bg-white/90 text-zinc-500 dark:bg-zinc-800/90 dark:text-zinc-400"
              : "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              live ? "animate-pulse bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {live ? "En vivo" : "Reconectando…"}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 text-center text-sm text-zinc-400">
          No hay mensajes en esta conversación.
        </p>
      ) : (
        <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
          {visible.map((m) => {
            const incoming = m.message_type === 0;
            const day = dayLabel(m.created_at);
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-zinc-200 px-3 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">
                      {day}
                    </span>
                  </div>
                )}
                <div
                  className={`flex ${incoming ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                      incoming
                        ? "rounded-bl-sm bg-white text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                        : "rounded-br-sm bg-emerald-600 text-white"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <p
                      className={`mt-0.5 text-right text-[10px] ${
                        incoming ? "text-zinc-400" : "text-emerald-100"
                      }`}
                    >
                      {clockTime(m.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
