/** Tiempo relativo corto en español a partir de un epoch en segundos. */
export function timeAgo(epochSeconds?: number): string {
  if (!epochSeconds) return "";
  const diff = Date.now() / 1000 - epochSeconds;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return `hace ${Math.floor(diff / 86400)} d`;
}

/** Hora corta HH:MM a partir de un epoch en segundos. */
export function clockTime(epochSeconds?: number): string {
  if (!epochSeconds) return "";
  return new Date(epochSeconds * 1000).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Fecha legible (ej. "21 jun 2026") a partir de un epoch en segundos. */
export function dayLabel(epochSeconds?: number): string {
  if (!epochSeconds) return "";
  return new Date(epochSeconds * 1000).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
