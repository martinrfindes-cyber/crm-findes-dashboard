"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { sendAgentMessage, setIaPaused, ChatwootError } from "@/lib/chatwoot";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Envía una respuesta como agente humano y refresca el hilo. */
export async function sendReply(
  conversationId: number,
  content: string,
): Promise<ActionResult> {
  await requireSession();
  const text = content.trim();
  if (!text) return { ok: false, error: "El mensaje está vacío." };
  try {
    await sendAgentMessage(conversationId, text);
    revalidatePath(`/conversations/${conversationId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ChatwootError
          ? err.message
          : "No se pudo enviar el mensaje.",
    };
  }
}

/** Pausa (modo humano) o reactiva la IA para una conversación. */
export async function toggleIa(
  conversationId: number,
  paused: boolean,
): Promise<ActionResult> {
  await requireSession();
  try {
    await setIaPaused(conversationId, paused);
    revalidatePath(`/conversations/${conversationId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ChatwootError
          ? err.message
          : "No se pudo cambiar el modo.",
    };
  }
}
