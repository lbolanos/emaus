// Helpers puros de tiempo del minuto a minuto, COMPARTIDOS por API y web.
// Single source of truth del manejo "after-midnight": una hora < 6 es madrugada
// del día siguiente, pero se agrupa bajo el mismo "Día N" (igual criterio que la
// materialización del retiro y que la detección de huecos/solapes en la UI).

export const AFTER_MIDNIGHT_HOUR = 6;

/**
 * Offset de día para anclar un item: las horas < 6 caen en `baseDate + day`
 * (madrugada del día siguiente), el resto en `baseDate + (day - 1)`.
 */
export function afterMidnightDayOffset(hour: number, day: number): number {
  return hour < AFTER_MIDNIGHT_HOUR ? day : day - 1;
}

/**
 * "HH:MM" → minutos del día con offset after-midnight (h < 6 → +1440), para que
 * la madrugada se ordene/calcule DESPUÉS de la noche. null si vacío/ inválido.
 */
export function hhmmToDayMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h > 23 || mi > 59) return null;
  const base = h * 60 + mi;
  return h < AFTER_MIDNIGHT_HOUR ? base + 1440 : base;
}

/** Minutos del día (pueden venir ≥ 1440 por after-midnight) → "HH:MM". */
export function dayMinutesToHHMM(min: number): string {
  const norm = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const mi = norm % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(mi)}`;
}

/**
 * Gap (min) entre el fin de un item de template y el inicio del siguiente.
 * Positivo = hueco, negativo = solape. null si falta alguna hora.
 */
export function templateGap(
  curStart: string | null | undefined,
  curDurationMinutes: number,
  nextStart: string | null | undefined,
): number | null {
  const s = hhmmToDayMinutes(curStart);
  const n = hhmmToDayMinutes(nextStart);
  if (s == null || n == null) return null;
  return n - (s + (curDurationMinutes || 0));
}
