"use server";

import { getSession } from "@/lib/auth";
import { setLeadTier, deleteConversation } from "@/lib/chatwoot";
import type { LeadTier } from "@/lib/lead";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Mueve manualmente una conversación de columna en el tablero (override del
 * tier). `tier = null` revierte al tier automático. Lo invoca el tablero del
 * home (LiveConversationList) al arrastrar/soltar o elegir en el menú.
 */
export async function moveLeadTier(
  conversationId: number,
  tier: LeadTier | null,
): Promise<Result> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autenticado" };
  try {
    await setLeadTier(conversationId, tier);
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo mover el lead." };
  }
}

/**
 * Borra leads (conversaciones) de Chatwoot de forma permanente. Recibe una o
 * varias ids: el tablero la usa tanto para borrar una tarjeta individual como
 * para vaciar una columna entera. Devuelve cuántas se borraron; si alguna
 * falla, informa el error pero igual borra las demás.
 */
export async function deleteLeads(
  conversationIds: number[],
): Promise<Result & { deleted?: number }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "No autenticado" };
  if (conversationIds.length === 0) return { ok: true, deleted: 0 };

  const results = await Promise.allSettled(
    conversationIds.map((id) => deleteConversation(id)),
  );
  const deleted = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - deleted;

  if (failed > 0) {
    return {
      ok: false,
      error:
        deleted > 0
          ? `Se borraron ${deleted}, pero ${failed} fallaron.`
          : "No se pudieron borrar los leads.",
      deleted,
    };
  }
  return { ok: true, deleted };
}
