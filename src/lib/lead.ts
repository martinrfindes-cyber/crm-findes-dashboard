import type { Message, Sender } from "./chatwoot";

/**
 * Extracción de campos del lead + lead scoring (Fase 3).
 * Todo se calcula en el dashboard a partir de los mensajes del visitante
 * (message_type 0) y el contacto. Heurístico: regex para email/teléfono,
 * patrones para nombre, palabras clave para intereses, y un score por reglas.
 */

export type LeadTier = "caliente" | "tibio" | "frio";

/** Resumen ligero del lead para listados/tablero (sin el detalle de razones). */
export type LeadSummary = {
  score: number;
  /** Tier efectivo: el manual si la persona lo movió, si no el automático. */
  tier: LeadTier;
  /** Tier que calcularían las reglas a partir de los mensajes (ignora override). */
  tierAuto: LeadTier;
  /** True si el tier viene de un override manual (movido en el tablero). */
  manual: boolean;
  nombre: string | null;
  /** Datos de contacto extraídos, útiles para exportar el lead a CSV. */
  email: string | null;
  telefono: string | null;
  intereses: string[];
};

/** Type guard para validar un tier que llega como string (custom_attribute/form). */
export function isLeadTier(v: unknown): v is LeadTier {
  return v === "caliente" || v === "tibio" || v === "frio";
}

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

// Etiqueta explícita ("me llamo X", "mi nombre es X", "nombre: X"): el nombre va
// justo después; lo aceptamos en cualquier caso (la gente escribe "martin" en el
// chat) y lo capitalizamos al mostrarlo. Captura 1-2 palabras de letras.
const NAME_LABEL_RE =
  /\b(?:me llamo|mi nombre es|mi nombre|nombre:?)\s+([a-záéíóúñ]{2,}(?:\s+[a-záéíóúñ]{2,})?)/i;

// "soy X": más ambiguo (soy de Monterrey, soy estudiante…); aquí sí exigimos que
// el nombre vaya capitalizado para no capturar palabras comunes en minúscula.
const NAME_SOY_RE =
  /\b[Ss]oy\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{1,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{1,})?)/;

/** Capitaliza la inicial de cada palabra ("martin perez" → "Martin Perez"). */
function capitalizar(nombre: string): string {
  return nombre
    .toLowerCase()
    .replace(/(^|\s)([a-záéíóúñ])/g, (_, sep, c) => sep + c.toUpperCase());
}

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

// El bot pide el nombre ("¿me compartes tu nombre?", "¿cómo te llamas?").
const PIDE_NOMBRE_RE = /\b(tu nombre|c[oó]mo te llamas|cu[aá]l es tu nombre)\b/i;

// Algo que "parece nombre": 1-3 palabras solo de letras (sin dígitos, @, etc.).
const PARECE_NOMBRE_RE = /^[a-záéíóúñ]{2,}(?:\s+[a-záéíóúñ]{2,}){0,2}$/i;

// Respuestas comunes que NO son un nombre, aunque sean solo letras.
const NO_ES_NOMBRE = new Set([
  "si", "sí", "no", "ok", "okay", "hola", "gracias", "ambas", "ambos",
  "claro", "dale", "listo", "bien", "perfecto", "ninguno", "ninguna",
  "nada", "tal vez", "quiza", "quizá", "online", "presencial",
]);

/**
 * Nombre por contexto: si el bot pidió el nombre, la siguiente respuesta del
 * visitante suele ser justo el nombre, aunque venga sin "soy"/"me llamo"
 * (ej. el bot pregunta "¿tu nombre?" y la persona contesta "Ana Pérez").
 */
function nombrePorContexto(messages: Message[]): string | null {
  for (let i = 0; i < messages.length - 1; i++) {
    const m = messages[i];
    if (m.message_type !== 1 || !m.content || !PIDE_NOMBRE_RE.test(m.content)) continue;
    // Evaluamos solo la primera respuesta del visitante tras la pregunta.
    for (let j = i + 1; j < messages.length; j++) {
      const r = messages[j];
      if (r.message_type !== 0 || !r.content) continue;
      const cand = r.content.trim().replace(/[.,!¡¿?]+$/g, "").trim();
      if (PARECE_NOMBRE_RE.test(cand) && !NO_ES_NOMBRE.has(cand.toLowerCase())) {
        return capitalizar(cand);
      }
      break;
    }
  }
  return null;
}

function buscarNombre(messages: Message[], sender?: Sender): string | null {
  if (sender?.name && !esNombreAuto(sender.name)) return sender.name.trim();
  const textos = messages
    .filter((m) => m.message_type === 0 && m.content)
    .map((m) => m.content as string);
  // 1) Con palabra gatillo: "me llamo X", "soy X".
  for (const t of textos) {
    const m = t.match(NAME_LABEL_RE) ?? t.match(NAME_SOY_RE);
    if (m) return capitalizar(m[1].trim());
  }
  // 2) Por contexto: el bot preguntó el nombre y el visitante respondió.
  return nombrePorContexto(messages);
}

// Niveles que la gente menciona junto al curso ("excel avanzado", "inglés básico").
const NIVEL_RE = /\b(b[aá]sic[oa]|inicial|intermedi[oa]|avanzad[oa])\b/i;

/** Normaliza la palabra de nivel a una etiqueta ("avanzada" → "Avanzado"). */
function etiquetaNivel(palabra: string): string {
  const n = palabra.toLowerCase();
  if (n.startsWith("interm")) return "Intermedio";
  if (n.startsWith("avanz")) return "Avanzado";
  return "Básico"; // básico / básica / inicial
}

function buscarIntereses(textos: string[]): string[] {
  const blob = textos.join(" \n ");

  // Posición de cada curso mencionado, ordenados por aparición.
  const hits: { label: string; start: number; end: number }[] = [];
  for (const { label, re } of INTERESES) {
    const m = re.exec(blob);
    if (m) hits.push({ label, start: m.index, end: m.index + m[0].length });
  }
  hits.sort((a, b) => a.start - b.start);

  // En español el nivel va tras el curso ("excel avanzado"). Miramos hacia
  // adelante, pero sin pasar del siguiente curso para que no se contagie.
  return hits.map((h, i) => {
    const tope = i + 1 < hits.length ? hits[i + 1].start : blob.length;
    const ventana = blob.slice(h.end, Math.min(h.end + 25, tope));
    const m = ventana.match(NIVEL_RE);
    return m ? `${h.label} ${etiquetaNivel(m[1])}` : h.label;
  });
}

/** Extrae campos del lead y calcula su score a partir de la conversación. */
export function analizarLead(messages: Message[], sender?: Sender): LeadInsights {
  const textosVisitante = messages
    .filter((m) => m.message_type === 0 && m.content)
    .map((m) => m.content as string);

  const email = buscarEmail(textosVisitante) ?? sender?.email?.trim() ?? null;
  const telefono =
    buscarTelefono(textosVisitante) ?? sender?.phone_number?.trim() ?? null;
  const nombre = buscarNombre(messages, sender);
  const intereses = buscarIntereses(textosVisitante);
  const nVisitante = textosVisitante.length;

  // Scoring por reglas.
  const razones: { texto: string; puntos: number }[] = [];
  let score = 0;
  if (nombre) {
    score += 15;
    razones.push({ texto: "Dio su nombre", puntos: 15 });
  }
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
