import "server-only";
import { listConversations, listMessages, type Conversation } from "./chatwoot";
import { analizarLead, type LeadSummary } from "./lead";

/** Conversación enriquecida con su lead score/tier para el tablero del home. */
export type LeadConversation = Conversation & { lead: LeadSummary };

const FRIO: LeadSummary = { score: 0, tier: "frio", nombre: null };

/**
 * Lista las conversaciones y les adjunta el lead scoring calculado a partir de
 * sus mensajes (en paralelo). Es lo que alimenta el tablero Frío/Tibio/Caliente.
 * Si fallan los mensajes de una conversación, queda "frío" por defecto en vez de
 * tumbar todo el listado.
 */
export async function listConversationsWithLead(): Promise<LeadConversation[]> {
  const conversations = await listConversations();
  return Promise.all(
    conversations.map(async (c) => {
      try {
        const msgs = await listMessages(c.id);
        const { score, tier, nombre } = analizarLead(msgs, c.meta.sender);
        return { ...c, lead: { score, tier, nombre } };
      } catch {
        return { ...c, lead: FRIO };
      }
    }),
  );
}
