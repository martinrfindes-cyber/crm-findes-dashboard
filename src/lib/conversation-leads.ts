import "server-only";
import {
  listConversations,
  listMessages,
  LEAD_TIER_KEY,
  type Conversation,
} from "./chatwoot";
import { analizarLead, isLeadTier, type LeadSummary } from "./lead";

/** Conversación enriquecida con su lead score/tier para el tablero del home. */
export type LeadConversation = Conversation & { lead: LeadSummary };

const FRIO: LeadSummary = {
  score: 0,
  tier: "frio",
  tierAuto: "frio",
  manual: false,
  nombre: null,
};

/**
 * Lista las conversaciones y les adjunta el lead scoring calculado a partir de
 * sus mensajes (en paralelo). Es lo que alimenta el tablero Frío/Tibio/Caliente.
 * Si la persona a cargo movió la conversación a mano (custom_attribute
 * `tier_manual`), ese override prevalece sobre el tier automático.
 * Si fallan los mensajes de una conversación, queda "frío" por defecto en vez de
 * tumbar todo el listado.
 */
export async function listConversationsWithLead(): Promise<LeadConversation[]> {
  const conversations = await listConversations();
  return Promise.all(
    conversations.map(async (c) => {
      const raw = c.custom_attributes?.[LEAD_TIER_KEY];
      const override = isLeadTier(raw) ? raw : null;
      try {
        const auto = analizarLead(await listMessages(c.id), c.meta.sender);
        return {
          ...c,
          lead: {
            score: auto.score,
            tier: override ?? auto.tier,
            tierAuto: auto.tier,
            manual: override !== null,
            nombre: auto.nombre,
          },
        };
      } catch {
        return {
          ...c,
          lead: override
            ? { ...FRIO, tier: override, manual: true }
            : FRIO,
        };
      }
    }),
  );
}
