import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { chatwootConfigured, ChatwootError } from "@/lib/chatwoot";
import { listConversationsWithLead } from "@/lib/conversation-leads";

/**
 * Lista las conversaciones del inbox en JSON. Lo consume LiveConversationList
 * por polling para mantener viva la lista del home (chats nuevos, no-leídos,
 * estado) sin recargar.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!chatwootConfigured()) {
    return NextResponse.json({ error: "Chatwoot no configurado" }, { status: 503 });
  }

  try {
    const conversations = await listConversationsWithLead();
    return NextResponse.json({ conversations });
  } catch (err) {
    const status = err instanceof ChatwootError && err.status ? err.status : 500;
    return NextResponse.json(
      { error: "No se pudieron cargar las conversaciones." },
      { status },
    );
  }
}
