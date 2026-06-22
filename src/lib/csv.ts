import type { LeadConversation } from "./conversation-leads";
import type { LeadTier } from "./lead";
import { TIER_LABEL } from "./lead";
import { lastMessagePreview } from "./format";

/**
 * Exportación de leads a CSV desde el tablero del home. Vive acá (sin
 * `server-only`) para poder usarse en componentes cliente: el botón arma el CSV
 * en el navegador con lo que ya tiene en memoria y dispara la descarga.
 */

const STATUS_LABEL: Record<LeadConversation["status"], string> = {
  open: "Abierta",
  pending: "Pendiente",
  resolved: "Resuelta",
  snoozed: "Pospuesta",
};

/** Conversación + tier efectivo (ya resuelto el override manual del tablero). */
export type LeadRow = { c: LeadConversation; tier: LeadTier; manual: boolean };

const HEADERS = [
  "ID",
  "Nombre",
  "Email",
  "Teléfono",
  "Temperatura",
  "Movido a mano",
  "Score",
  "Intereses",
  "Estado",
  "Asignado",
  "Último mensaje",
  "Fecha",
] as const;

/** Escapa un valor para CSV: comillas dobles si trae coma, comilla o salto. */
function cell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fecha(epochSeconds?: number): string {
  if (!epochSeconds) return "";
  return new Date(epochSeconds * 1000).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function row({ c, tier, manual }: LeadRow): string {
  const nombre = c.lead.nombre || c.meta.sender?.name?.trim() || `Visitante #${c.id}`;
  return [
    c.id,
    nombre,
    c.lead.email,
    c.lead.telefono,
    TIER_LABEL[tier],
    manual ? "Sí" : "No",
    c.lead.score,
    c.lead.intereses.join(" | "),
    STATUS_LABEL[c.status],
    c.meta.assignee?.name ?? "",
    lastMessagePreview(c),
    fecha(c.timestamp),
  ]
    .map(cell)
    .join(",");
}

/** Arma el contenido CSV (con encabezados) a partir de las filas de leads. */
export function leadsToCsv(rows: LeadRow[]): string {
  return [HEADERS.join(","), ...rows.map(row)].join("\r\n");
}

/**
 * Dispara la descarga de un CSV en el navegador. Antepone un BOM UTF-8 para que
 * Excel respete los acentos y emojis.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
