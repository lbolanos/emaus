/**
 * Estado "en vivo" de un retiro para el dashboard — TZ-safe.
 *
 * Las fechas del retiro (`startDate`/`endDate`) son columnas SQLite `'date'`:
 * representan un DÍA CALENDARIO, no un instante. El bug clásico es compararlas
 * con `new Date("2026-06-05")` + `setHours(0,0,0,0)`: la string se parsea como
 * medianoche UTC y luego `setHours` opera en hora local (CDMX, UTC-6), corriendo
 * todo un día hacia atrás. Resultado: un retiro de viernes se mostraba "en vivo"
 * desde el miércoles y el contador decía "hoy mismo" un día antes.
 *
 * La solución es trabajar siempre con strings `"YYYY-MM-DD"` (ancho fijo, padded),
 * que se comparan lexicográficamente en orden cronológico, y resolver el "hoy"
 * con `Intl.DateTimeFormat` en la timezone del retiro (ver skill timezone-handling,
 * Regla N°4).
 */

export const DEFAULT_RETREAT_TIMEZONE = 'America/Mexico_City';

/** Días de gracia antes del inicio (preparación final del día previo al retiro). */
export const RETREAT_GRACE_DAYS_BEFORE = 1;

/**
 * Normaliza un valor de fecha a `"YYYY-MM-DD"` sin shift de zona horaria.
 * - string: toma los primeros 10 caracteres (sirve para `"2026-06-05"` y para ISO completos).
 * - Date: lee componentes UTC (las columnas `'date'` se guardan a medianoche UTC).
 */
export function toYmd(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, '0');
  const d = String(value.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Día calendario actual ("YYYY-MM-DD") en la timezone indicada. */
export function todayYmdInTz(
  tz: string = DEFAULT_RETREAT_TIMEZONE,
  now: Date = new Date(),
): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Convierte `"YYYY-MM-DD"` al instante de su medianoche UTC (en ms). */
export function ymdToUtcMillis(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Suma (o resta, con `days` negativo) días calendario a un `"YYYY-MM-DD"`. */
export function addDaysYmd(ymd: string, days: number): string {
  return new Date(ymdToUtcMillis(ymd) + days * 86_400_000).toISOString().slice(0, 10);
}

export interface RetreatLikeDates {
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  timezone?: string | null;
}

/**
 * ¿El retiro está "en vivo" hoy? Considera el día de gracia previo al inicio y
 * todo el rango hasta el final inclusive, evaluado en la timezone del retiro.
 */
export function isRetreatLive(
  retreat: RetreatLikeDates | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!retreat?.startDate || !retreat?.endDate) return false;
  const startYmd = toYmd(retreat.startDate);
  const endYmd = toYmd(retreat.endDate);
  if (!startYmd || !endYmd) return false;
  const tz = retreat.timezone || DEFAULT_RETREAT_TIMEZONE;
  const today = todayYmdInTz(tz, now);
  const graceStart = addDaysYmd(startYmd, -RETREAT_GRACE_DAYS_BEFORE);
  return today >= graceStart && today <= endYmd;
}

/**
 * Días calendario hasta el inicio del retiro (negativo si ya pasó, 0 si es hoy),
 * evaluado en la timezone del retiro. `null` si no hay `startDate`.
 */
export function daysUntilRetreat(
  retreat: Pick<RetreatLikeDates, 'startDate' | 'timezone'> | null | undefined,
  now: Date = new Date(),
): number | null {
  const startYmd = toYmd(retreat?.startDate);
  if (!startYmd) return null;
  const tz = retreat?.timezone || DEFAULT_RETREAT_TIMEZONE;
  const today = todayYmdInTz(tz, now);
  return Math.round((ymdToUtcMillis(startYmd) - ymdToUtcMillis(today)) / 86_400_000);
}
