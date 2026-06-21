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
