import { requireSession } from "@/lib/auth";
import { chatwootConfigured, ChatwootError } from "@/lib/chatwoot";
import {
  listConversationsWithLead,
  type LeadConversation,
} from "@/lib/conversation-leads";
import { initials } from "@/lib/format";
import LiveConversationList from "./LiveConversationList";

export default async function DashboardPage() {
  const session = await requireSession();

  let conversations: LeadConversation[] = [];
  let loadError: string | null = null;
  const configured = chatwootConfigured();

  if (configured) {
    try {
      conversations = await listConversationsWithLead();
    } catch (err) {
      loadError =
        err instanceof ChatwootError
          ? err.message
          : "No se pudieron cargar las conversaciones.";
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-100 dark:bg-zinc-950">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            CRM FINDES
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800">
            Chat web
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
              {initials(session.name)}
            </span>
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {session.name}
            </span>
          </div>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              Salir
            </button>
          </form>
        </div>
      </header>

      {/* Contenido */}
      <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            Conversaciones
          </h1>
          {configured && !loadError && (
            <span className="text-sm text-zinc-500">{conversations.length} en total</span>
          )}
        </div>

        {!configured && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            Falta el <code className="font-mono">CHATWOOT_AGENT_TOKEN</code> en{" "}
            <code className="font-mono">.env.local</code>. Pegá tu Access Token de agente de
            Chatwoot y reiniciá el server para ver las conversaciones.
          </div>
        )}

        {configured && loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
            {loadError}
          </div>
        )}

        {configured && !loadError && (
          <LiveConversationList initial={conversations} />
        )}
      </main>
    </div>
  );
}
