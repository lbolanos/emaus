// Helpers puros de tiempo de las Tareas Pre-Retiro, COMPARTIDOS por API y web.
// El template guarda el "tiempo antes del retiro" como días (`dueOffsetDays`);
// al materializar se calcula dueDate = retreat.startDate − offset. Todo el
// manejo de fechas es sobre strings `YYYY-MM-DD` con aritmética UTC — nunca
// `new Date('YYYY-MM-DD')` + getters locales (bug conocido de TZ: la fecha
// salta un día en horarios negativos como CDMX).

export const MONTH_DAYS = 30;
export const WEEK_DAYS = 7;
/** Una tarea con dueDate a ≤ 7 días se marca "próxima a vencer" (ámbar). */
export const SOON_THRESHOLD_DAYS = 7;

export type DueOffsetUnit = 'months' | 'weeks' | 'days';

export type PreRetreatTaskSemaphore = 'done' | 'overdue' | 'soon' | 'ok' | 'none';

/** (valor, unidad) → días. Mes = 30 días por convención (igual que el Excel). */
export function partsToOffsetDays(value: number, unit: DueOffsetUnit): number {
	const v = Math.max(0, Math.round(value));
	if (unit === 'months') return v * MONTH_DAYS;
	if (unit === 'weeks') return v * WEEK_DAYS;
	return v;
}

/**
 * Días → (valor, unidad) para mostrar/editar. Regla anti-ambigüedad (round-trip
 * estable con partsToOffsetDays): ≥ 60 y múltiplo de 30 → meses; si no,
 * múltiplo de 7 (≥ 7) → semanas; si no → días. Así 84 = "12 semanas" (no
 * "2.8 meses") y 120 = "4 meses" (aunque también es múltiplo de 7·… no lo es).
 */
export function offsetDaysToParts(days: number): { value: number; unit: DueOffsetUnit } {
	const d = Math.max(0, Math.round(days));
	if (d >= 60 && d % MONTH_DAYS === 0) return { value: d / MONTH_DAYS, unit: 'months' };
	if (d >= WEEK_DAYS && d % WEEK_DAYS === 0) return { value: d / WEEK_DAYS, unit: 'weeks' };
	return { value: d, unit: 'days' };
}

/** Días → etiqueta en español: "4 meses", "12 semanas", "1 semana", "2 días". */
export function formatDueOffset(days: number): string {
	const { value, unit } = offsetDaysToParts(days);
	if (unit === 'months') return value === 1 ? '1 mes' : `${value} meses`;
	if (unit === 'weeks') return value === 1 ? '1 semana' : `${value} semanas`;
	return value === 1 ? '1 día' : `${value} días`;
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * `startDate` (YYYY-MM-DD o ISO con esa cabeza) − offsetDays → `YYYY-MM-DD`.
 * Aritmética de calendario pura en UTC. null si startDate no parsea.
 */
export function computeDueDate(
	startDate: string | null | undefined,
	offsetDays: number,
): string | null {
	if (!startDate) return null;
	const m = DATE_ONLY_RE.exec(String(startDate).trim());
	if (!m) return null;
	const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - Math.round(offsetDays));
	const d = new Date(utc);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Diferencia en días de calendario entre dos `YYYY-MM-DD` (b − a). null si inválidas. */
export function diffDays(a: string | null | undefined, b: string | null | undefined): number | null {
	const ma = a ? DATE_ONLY_RE.exec(String(a).trim()) : null;
	const mb = b ? DATE_ONLY_RE.exec(String(b).trim()) : null;
	if (!ma || !mb) return null;
	const ta = Date.UTC(Number(ma[1]), Number(ma[2]) - 1, Number(ma[3]));
	const tb = Date.UTC(Number(mb[1]), Number(mb[2]) - 1, Number(mb[3]));
	return Math.round((tb - ta) / 86_400_000);
}

/**
 * Semáforo V1 de una tarea: done/N-A → 'done'/'none'; sin dueDate → 'none';
 * vencida → 'overdue'; vence en ≤ SOON_THRESHOLD_DAYS → 'soon'; resto → 'ok'.
 */
export function taskSemaphore(
	dueDate: string | null | undefined,
	todayISO: string,
	status: string,
): PreRetreatTaskSemaphore {
	if (status === 'done') return 'done';
	if (status === 'not_applicable') return 'none';
	const delta = diffDays(todayISO, dueDate);
	if (delta == null) return 'none';
	if (delta < 0) return 'overdue';
	if (delta <= SOON_THRESHOLD_DAYS) return 'soon';
	return 'ok';
}

/**
 * Progreso agregado de una tarea padre: `done` cuenta sub-tareas 'done';
 * `total` excluye las 'not_applicable' (no cuentan ni a favor ni en contra).
 */
export function computeTaskProgress(children: Array<{ status: string }>): {
	done: number;
	total: number;
} {
	let done = 0;
	let total = 0;
	for (const c of children) {
		if (c.status === 'not_applicable') continue;
		total++;
		if (c.status === 'done') done++;
	}
	return { done, total };
}
