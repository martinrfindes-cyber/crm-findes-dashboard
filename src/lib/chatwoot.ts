import "server-only";

/**
 * Cliente server-side de la API de Chatwoot.
 * El dashboard no reemplaza a Chatwoot: lo usa como motor vía esta API.
 */

const BASE_URL = process.env.CHATWOOT_BASE_URL ?? "";
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID ?? "";
const TOKEN = process.env.CHATWOOT_AGENT_TOKEN ?? "";

export class ChatwootError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ChatwootError";
    this.status = status;
  }
}

export function chatwootConfigured(): boolean {
  return Boolean(BASE_URL && ACCOUNT_ID && TOKEN);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!chatwootConfigured()) {
    throw new ChatwootError(
      "Falta configurar Chatwoot (CHATWOOT_BASE_URL / ACCOUNT_ID / AGENT_TOKEN en .env.local).",
      0,
    );
  }
  const url = `${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      api_access_token: TOKEN,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ChatwootError(
      `Chatwoot ${res.status} en ${path}: ${text.slice(0, 200)}`,
      res.status,
    );
  }
  return (await res.json()) as T;
}

// ─── Tipos (subset de la API de Chatwoot que usamos) ───
export type Sender = {
  id: number;
  name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  /** "contact" (visitante), "user" (agente), "agent_bot" (el bot IA) */
  type?: string | null;
  additional_attributes?: Record<string, unknown> | null;
  custom_attributes?: Record<string, unknown> | null;
};

export type Conversation = {
  id: number;
  status: "open" | "resolved" | "pending" | "snoozed";
  unread_count: number;
  timestamp: number;
  meta: {
    sender?: Sender;
    assignee?: { id: number; name: string } | null;
  };
  custom_attributes?: Record<string, unknown> | null;
  additional_attributes?: Record<string, unknown> | null;
  messages?: { content?: string | null; created_at?: number; message_type?: number }[];
  last_non_activity_message?: { content?: string | null } | null;
};

/** message_type de Chatwoot: 0 incoming (visitante), 1 outgoing (bot/agente), 2 activity, 3 template */
export type Message = {
  id: number;
  content: string | null;
  message_type: 0 | 1 | 2 | 3;
  created_at: number;
  private: boolean;
  sender?: Sender | null;
};

type ConversationsResponse = {
  data: {
    meta: { mine_count: number; assigned_count: number; unassigned_count: number; all_count: number };
    payload: Conversation[];
  };
};

/** Lista conversaciones del inbox (estado por defecto: todas, abiertas primero). */
export async function listConversations(params?: {
  status?: "open" | "resolved" | "pending" | "all";
  assigneeType?: "me" | "unassigned" | "all";
}): Promise<Conversation[]> {
  const qs = new URLSearchParams();
  qs.set("status", params?.status ?? "all");
  qs.set("assignee_type", params?.assigneeType ?? "all");
  const data = await api<ConversationsResponse>(`/conversations?${qs.toString()}`);
  return data.data.payload ?? [];
}

/** Trae una conversación puntual (incluye meta.sender, custom_attributes, etc.). */
export async function getConversation(id: number): Promise<Conversation> {
  return api<Conversation>(`/conversations/${id}`);
}

type MessagesResponse = { payload: Message[]; meta?: unknown };

/** Lista los mensajes de una conversación, en orden cronológico ascendente. */
export async function listMessages(conversationId: number): Promise<Message[]> {
  const data = await api<MessagesResponse>(`/conversations/${conversationId}/messages`);
  const list = data.payload ?? [];
  return list.sort((a, b) => a.created_at - b.created_at);
}

/** Texto del último mensaje legible de una conversación. */
export function lastMessagePreview(c: Conversation): string {
  const fromList = c.messages?.length ? c.messages[c.messages.length - 1]?.content : null;
  const text = c.last_non_activity_message?.content ?? fromList ?? "";
  return text?.trim() || "(sin mensajes)";
}

// ─── Fase C: responder como humano + toggle IA/Humano ───

/**
 * Flag por conversación que pausa la IA (modo humano). Es un custom_attribute
 * de la conversación: el dashboard lo setea por API y n8n lo revisará en el
 * Filter del workflow (ruta `body.conversation.custom_attributes.ia_pausada`,
 * a verificar en un webhook REAL antes de cablearlo en n8n).
 */
export const IA_PAUSED_KEY = "ia_pausada";

/** True si la IA está pausada para esta conversación (modo humano). */
export function isIaPaused(c: Conversation): boolean {
  return Boolean(c.custom_attributes?.[IA_PAUSED_KEY]);
}

/** Envía un mensaje saliente como agente humano a la conversación. */
export async function sendAgentMessage(
  conversationId: number,
  content: string,
): Promise<Message> {
  return api<Message>(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, message_type: "outgoing" }),
  });
}

/**
 * Pausa o reactiva la IA para una conversación. El endpoint de Chatwoot
 * REEMPLAZA todo el objeto custom_attributes, así que primero leemos los
 * actuales y los fusionamos para no borrar los datos de lead (ruta_interes,
 * origen, curso, etc.).
 */
export async function setIaPaused(
  conversationId: number,
  paused: boolean,
): Promise<void> {
  const conv = await getConversation(conversationId);
  const merged = {
    ...(conv.custom_attributes ?? {}),
    [IA_PAUSED_KEY]: paused,
  };
  await api(`/conversations/${conversationId}/custom_attributes`, {
    method: "POST",
    body: JSON.stringify({ custom_attributes: merged }),
  });
}
