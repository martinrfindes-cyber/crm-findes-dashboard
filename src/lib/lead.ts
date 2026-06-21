import type { Message, Sender } from "./chatwoot";

/**
 * Extracción de campos del lead + lead scoring (Fase 3).
 * Todo se calcula en el dashboard a partir de los mensajes del visitante
 * (message_type 0) y el contacto. Heurístico: regex para email/teléfono,
 * patrones para nombre, palabras clave para intereses, y un score por reglas.
 */

export type LeadTier = "caliente" | "tibio" | "frio";

export type LeadInsights = {
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  intereses: string[];
  score: number; // 0-100
  tier: LeadTier;
  razones: { texto: string; puntos: number }[];
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

// Secuencias tipo teléfono (con o sin lada +52 y separadores).
const PHONE_RE = /(\+?52[\s-]?)?(\(?\d{2,3}\)?[\s-]?)?\d{3,4}[\s-]?\d{4}/g;

// "me llamo X", "mi nombre es X", "soy X" → captura 1-2 palabras capitalizadas.
const NAME_RE =
  /\b(?:me llamo|mi nombre es|mi nombre|soy|nombre:?)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{1,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{1,})?)/;

// Catálogo de intereses típicos de FINDES (curso/área).
const INTERESES: { label: string; re: RegExp }[] = [
  { label: "Excel", re: /\bexcel\b/i },
  { label: "Finanzas", re: /\bfinanzas?\b/i },
  { label: "Contabilidad", re: /\bcontab(?:ilidad|le)\b/i },
  { label: "Administración", re: /\badministraci[oó]n|administrativ/i },
  { label: "Ventas", re: /\bventas?\b/i },
  { label: "Recursos Humanos", re: /\brecursos humanos|rr?\.?\s?hh\.?|\brh\b/i },
  { label: "Informática", re: /\binform[aá]tica|computaci[oó]n\b/i },
  { label: "Marketing", re: /\bmarketing|mercadotecnia\b/i },
  { label: "Liderazgo", re: /\blideraz?go|l[ií]der\b/i },
  { label: "Atención al cliente", re: /\batenci[oó]n al cliente|servicio al cliente\b/i },
  { label: "Inglés", re: /\bingl[eé]s\b/i },
];

/** True si el nombre del contacto es autogenerado por Chatwoot (no es un nombre real). */
function esNombreAuto(name?: string | null): boolean {
  if (!name) return true;
  const n = name.trim();
  return /^[a-z]+-[a-z]+-\d+$/.test(n) || /^visitante/i.test(n);
}

function buscarEmail(textos: string[]): string | null {
  for (const t of textos) {
    const m = t.match(EMAIL_RE);
    if (m) return m[0];
  }
  return null;
}

function buscarTelefono(textos: string[]): string | null {
  for (const t of textos) {
    const candidatos = t.match(PHONE_RE) || [];
    for (const c of candidatos) {
      const digitos = c.replace(/\D/g, "");
      let nacional = digitos;
      if (digitos.length === 13 && digitos.startsWith("521")) nacional = digitos.slice(3);
      else if (digitos.length === 12 && digitos.startsWith("52")) nacional = digitos.slice(2);
      if (nacional.length === 10) {
        return `${nacional.slice(0, 2)} ${nacional.slice(2, 6)} ${nacional.slice(6)}`;
      }
    }
  }
  return null;
}

function buscarNombre(textos: string[], sender?: Sender): string | null {
  if (sender?.name && !esNombreAuto(sender.name)) return sender.name.trim();
  for (const t of textos) {
    const m = t.match(NAME_RE);
    if (m) return m[1].trim();
  }
  return null;
}

function buscarIntereses(textos: string[]): string[] {
  const blob = textos.join(" \n ");
  const out: string[] = [];
  for (const { label, re } of INTERESES) {
    if (re.test(blob)) out.push(label);
  }
  return out;
}

/** Extrae campos del lead y calcula su score a partir de la conversación. */
export function analizarLead(messages: Message[], sender?: Sender): LeadInsights {
  const textosVisitante = messages
    .filter((m) => m.message_type === 0 && m.content)
    .map((m) => m.content as string);

  const email = buscarEmail(textosVisitante) ?? sender?.email?.trim() ?? null;
  const telefono =
    buscarTelefono(textosVisitante) ?? sender?.phone_number?.trim() ?? null;
  const nombre = buscarNombre(textosVisitante, sender);
  const intereses = buscarIntereses(textosVisitante);
  const nVisitante = textosVisitante.length;

  // Scoring por reglas.
  const razones: { texto: string; puntos: number }[] = [];
  let score = 0;
  if (email) {
    score += 30;
    razones.push({ texto: "Dejó correo", puntos: 30 });
  }
  if (telefono) {
    score += 30;
    razones.push({ texto: "Dejó teléfono", puntos: 30 });
  }
  if (intereses.length > 0) {
    score += 20;
    razones.push({ texto: `Interés en ${intereses.join(", ")}`, puntos: 20 });
  }
  if (nVisitante > 0) {
    const eng = Math.min(nVisitante, 5) * 4; // hasta 20
    score += eng;
    razones.push({ texto: `Conversación activa (${nVisitante} msj)`, puntos: eng });
  }
  score = Math.min(score, 100);

  const tier: LeadTier = score >= 65 ? "caliente" : score >= 30 ? "tibio" : "frio";

  return { nombre, email, telefono, intereses, score, tier, razones };
}

export const TIER_LABEL: Record<LeadTier, string> = {
  caliente: "Caliente",
  tibio: "Tibio",
  frio: "Frío",
};
