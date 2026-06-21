"use server";

import { getSession } from "@/lib/auth";
import { setLeadTier } from "@/lib/chatwoot";
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
