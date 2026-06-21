import "server-only";

export type Agent = {
  username: string;
  password: string;
  name: string;
};

/**
 * Lista de agentes habilitados para el dashboard.
 *
 * Se lee de la env `AUTH_USERS` (JSON array). Pensado para escalar: sumar un 2º
 * agente = agregar un objeto al JSON, sin tocar código. Hoy arranca con uno solo.
 */
function loadAgents(): Agent[] {
  const raw = process.env.AUTH_USERS;
  if (!raw) {
    console.warn("[auth] AUTH_USERS no está definida; no hay agentes que puedan entrar.");
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("AUTH_USERS debe ser un array");
    return parsed.map((u) => ({
      username: String(u.username),
      password: String(u.password),
      name: String(u.name ?? u.username),
    }));
  } catch (err) {
    console.error("[auth] AUTH_USERS no es JSON válido:", err);
    return [];
  }
}

const agents = loadAgents();

/** Compara dos strings en tiempo constante para no filtrar info por timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Devuelve el agente si user+password coinciden, o null. */
export function verifyCredentials(username: string, password: string): Agent | null {
  const agent = agents.find((a) => a.username === username);
  if (!agent) return null;
  return safeEqual(agent.password, password) ? agent : null;
}

export function getAgentByUsername(username: string): Agent | null {
  return agents.find((a) => a.username === username) ?? null;
}
