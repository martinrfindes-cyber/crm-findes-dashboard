import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import {
  getConversation,
  listMessages,
  chatwootConfigured,
  isIaPaused,
  LEAD_TIER_KEY,
  ChatwootError,
  type Message,
  type Sender,
} from "@/lib/chatwoot";
import { isLeadTier, type LeadTier } from "@/lib/lead";
import ConversationView from "./ConversationView";

// Atributos internos (no son datos de lead): no se muestran en "Datos capturados".
const INTERNAL_ATTRS = new Set(["ia_pausada", LEAD_TIER_KEY]);

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
        <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
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
  let tierOverride: LeadTier | undefined;
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
    const rawTier = conv.custom_attributes?.[LEAD_TIER_KEY];
    if (isLeadTier(rawTier)) tierOverride = rawTier;
  } catch (err) {
    if (err instanceof ChatwootError && err.status === 404) notFound();
    loadError =
      err instanceof ChatwootError
        ? err.message
        : "No se pudo cargar la conversación.";
  }

  if (loadError) {
    return (
      <Shell>
        <div className="flex-1 overflow-y-auto bg-zinc-100 px-4 py-6 dark:bg-zinc-950">
          <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
            {loadError}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <ConversationView
        conversationId={conversationId}
        initialMessages={messages}
        sender={sender}
        status={status}
        iaPaused={iaPaused}
        leadAttrs={leadAttrs}
        tierOverride={tierOverride}
        fallbackName={`Visitante #${conversationId}`}
      />
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
