import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import {
  getConversation,
  listMessages,
  chatwootConfigured,
  isIaPaused,
  ChatwootError,
  type Message,
  type Sender,
} from "@/lib/chatwoot";
import { initials } from "@/lib/format";
import { analizarLead, TIER_LABEL, type LeadInsights } from "@/lib/lead";
import IaToggle from "./IaToggle";
import ReplyBox from "./ReplyBox";
import LiveThread from "./LiveThread";

const STATUS_LABEL: Record<string, string> = {
  open: "Abierta",
  pending: "Pendiente",
  resolved: "Resuelta",
  snoozed: "Pospuesta",
};

// Atributos internos (no son datos de lead): no se muestran en "Datos capturados".
const INTERNAL_ATTRS = new Set(["ia_pausada"]);

const TIER_STYLE: Record<string, string> = {
  caliente:
    "bg-red-100 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900",
  tibio:
    "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900",
  frio:
    "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-900",
};

/** Junta los atributos de lead (custom + additional) en pares legibles. */
function leadFields(
  ...sources: (Record<string, unknown> | null | undefined)[]
): { key: string; label: string; value: string }[] {
  const merged: Record<string, unknown> = {};
  for (const src of sources) if (src) Object.assign(merged, src);

  const out: { key: string; label: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(merged)) {
    if (INTERNAL_ATTRS.has(key)) continue;
    if (raw == null || raw === "") continue;
    const value =
      typeof raw === "object" ? JSON.stringify(raw) : String(raw);
    if (!value.trim()) continue;
    const label = key
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
    out.push({ key, label, value });
  }
  return out;
}

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId) || conversationId <= 0) notFound();

  if (!chatwootConfigured()) {
    return (
      <Shell>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Falta el <code className="font-mono">CHATWOOT_AGENT_TOKEN</code> en{" "}
          <code className="font-mono">.env.local</code>.
        </div>
      </Shell>
    );
  }

  let messages: Message[] = [];
  let sender: Sender | undefined;
  let status = "open";
  let iaPaused = false;
  let leadAttrs: { key: string; label: string; value: string }[] = [];
  let lead: LeadInsights | null = null;
  let loadError: string | null = null;

  try {
    const [conv, msgs] = await Promise.all([
      getConversation(conversationId),
      listMessages(conversationId),
    ]);
    messages = msgs;
    sender = conv.meta.sender;
    status = conv.status;
    iaPaused = isIaPaused(conv);
    // Solo custom_attributes (datos de lead que setea el widget/IA: ruta_interes,
    // origen, curso, etc.). Se omite additional_attributes a propósito: ahí Chatwoot
    // guarda telemetría del navegador (Browser, Referer, idioma…), no datos de lead.
    leadAttrs = leadFields(conv.custom_attributes, sender?.custom_attributes);
    // Fase 3: extracción de campos + lead scoring a partir de la conversación.
    lead = analizarLead(msgs, sender);
  } catch (err) {
    if (err instanceof ChatwootError && err.status === 404) notFound();
    loadError =
      err instanceof ChatwootError
        ? err.message
        : "No se pudo cargar la conversación.";
  }

  const name = sender?.name?.trim() || `Visitante #${conversationId}`;

  return (
    <Shell>
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
            {!loadError && (
              <IaToggle
                conversationId={conversationId}
                initialPaused={iaPaused}
              />
            )}
          </div>

          {/* Mensajes (tiempo real vía polling, Fase D) */}
          {loadError ? (
            <div className="flex-1 overflow-y-auto bg-zinc-100 px-4 py-6 dark:bg-zinc-950">
              <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
                {loadError}
              </div>
            </div>
          ) : (
            <LiveThread
              conversationId={conversationId}
              initialMessages={messages}
            />
          )}

          {/* Pie: responder como humano */}
          {!loadError && (
            <ReplyBox conversationId={conversationId} iaActive={!iaPaused} />
          )}
        </section>

        {/* Panel del lead */}
        <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-zinc-200 bg-white p-4 lg:flex dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Lead
            </h2>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200 text-base font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {initials(lead?.nombre || name)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {lead?.nombre || name}
                </p>
                {lead?.email && (
                  <p className="truncate text-xs text-zinc-500">{lead.email}</p>
                )}
                {lead?.telefono && (
                  <p className="truncate text-xs text-zinc-500">{lead.telefono}</p>
                )}
              </div>
            </div>
          </div>

          {/* Lead score (Fase 3) */}
          {lead && (
            <div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Lead score
              </h2>
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold ring-1 ${TIER_STYLE[lead.tier]}`}
                >
                  {lead.score}
                </span>
                <div className="min-w-0">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${TIER_STYLE[lead.tier]}`}
                  >
                    {TIER_LABEL[lead.tier]}
                  </span>
                  <p className="mt-1 text-[11px] text-zinc-400">de 100</p>
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
          )}

          {/* Interés detectado (Fase 3) */}
          {lead && lead.intereses.length > 0 && (
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
    </Shell>
  );
}

/** Marco con el header global + botón de volver. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-zinc-100 dark:bg-zinc-950">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-lg px-2 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            ← Volver
          </Link>
          <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            CRM FINDES
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}
