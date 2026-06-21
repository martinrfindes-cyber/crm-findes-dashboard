import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listMessages, chatwootConfigured, ChatwootError } from "@/lib/chatwoot";

/**
 * Devuelve los mensajes de una conversación en JSON. Lo consume LiveThread
 * por polling (Fase D, tiempo real para MVP). Usa getSession (no requireSession)
 * para responder 401 en vez de redirigir.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  if (!chatwootConfigured()) {
    return NextResponse.json({ error: "Chatwoot no configurado" }, { status: 503 });
  }

  try {
    const messages = await listMessages(conversationId);
    return NextResponse.json({ messages });
  } catch (err) {
    const status = err instanceof ChatwootError && err.status ? err.status : 500;
    return NextResponse.json(
      { error: "No se pudieron cargar los mensajes." },
      { status },
    );
  }
}
