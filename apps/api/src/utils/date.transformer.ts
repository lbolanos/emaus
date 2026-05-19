import { ValueTransformer } from 'typeorm';

export class DateTransformer implements ValueTransformer {
	to(value: Date | string | null): string | null {
		if (!value) {
			return null;
		}
		// If it's already a string, assume it's in the correct format or an ISO string.
		if (typeof value === 'string') {
			return value.split('T')[0];
		}
		// If it's a Date object, convert it to an ISO string and take the date part.
		return value.toISOString().split('T')[0];
	}

	from(value: string | null): Date | null {
		if (!value) {
			return null;
		}
		// When reading from the database, it will be a string in 'YYYY-MM-DD' format.
		// new Date() will parse this correctly as a UTC date.
		return new Date(value);
	}
}

/**
 * Transformer for datetime columns in SQLite.
 * SQLite stores datetime strings without timezone info (e.g. '2026-01-30 02:00:00.000').
 * Without this transformer, new Date() treats those strings as LOCAL time instead of UTC,
 * causing dates to shift by the timezone offset on every read.
 */
export class DateTimeTransformer implements ValueTransformer {
	to(value: Date | string | null): string | null {
		if (!value) return null;
		if (typeof value === 'string') return value;
		return value.toISOString();
	}

	from(value: string | null): Date | null {
		if (!value) return null;
		// Ensure SQLite datetime strings are interpreted as UTC
		if (typeof value === 'string' && !value.endsWith('Z') && !value.includes('+')) {
			return new Date(value.replace(' ', 'T') + 'Z');
		}
		return new Date(value);
	}
}

/**
 * Infere la timezone IANA correspondiente a un par (latitud, longitud).
 * Usa `tz-lookup` (tabla embebida ~30KB, sin Internet, sin deps).
 *
 * Devuelve null si las coordenadas son inválidas o si están en mar abierto
 * sin zona horaria oficial. El caller debe caer al default
 * ('America/Mexico_City' u otro elegido por la app).
 *
 * Async: `tz-lookup` es CommonJS y se carga vía dynamic import para que
 * funcione tanto en ESM (runtime) como en CJS (Jest).
 */
type TzLookupFn = (lat: number, lon: number) => string;
let tzLookupFn: TzLookupFn | null = null;

async function loadTzLookup(): Promise<TzLookupFn | null> {
	if (tzLookupFn) return tzLookupFn;
	try {
		// `tz-lookup` es CommonJS — bajo NodeNext el shape puede ser la función
		// directamente o `{ default: fn }`. Usamos `any` aquí para evitar que el
		// tsc del bundle migrations (NodeNext + strict) infiera `never`.
		const mod: any = await import('tz-lookup' as any);
		const fn: TzLookupFn | null =
			typeof mod === 'function' ? (mod as TzLookupFn) : (mod?.default ?? null);
		tzLookupFn = fn;
		return tzLookupFn;
	} catch {
		return null;
	}
}

export async function inferTimezoneFromCoords(
	lat: number | null | undefined,
	lon: number | null | undefined,
): Promise<string | null> {
	if (
		typeof lat !== 'number' ||
		typeof lon !== 'number' ||
		Number.isNaN(lat) ||
		Number.isNaN(lon) ||
		lat < -90 ||
		lat > 90 ||
		lon < -180 ||
		lon > 180
	) {
		return null;
	}
	const fn = await loadTzLookup();
	if (!fn) return null;
	try {
		return fn(lat, lon);
	} catch {
		return null;
	}
}

/**
 * Construye un Date que representa la hora calendario `(y, m0, d, h, mi)`
 * interpretada en la timezone IANA `tz` (ej. 'America/Mexico_City',
 * 'America/Bogota'). Devuelve un Date apuntando al instante UTC equivalente.
 *
 * Útil para materializar plantillas de horario donde `defaultStartTime`
 * ('16:00') es hora local del retiro, no del servidor. Maneja DST
 * automáticamente vía Intl.DateTimeFormat.
 *
 * Implementación: tomamos un guess en UTC, lo formateamos en la zona
 * destino, y calculamos el offset entre lo formateado y el guess para
 * corregir. Pura, sin libs externas.
 */
export function makeDateInTimezone(
	y: number,
	m0: number,
	d: number,
	h: number,
	mi: number,
	tz: string,
): Date {
	const utcGuess = new Date(Date.UTC(y, m0, d, h, mi, 0, 0));
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(utcGuess);
	const get = (k: string): number =>
		Number(parts.find((p) => p.type === k)?.value ?? '0');
	const tzAsUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second'),
	);
	const offset = tzAsUtc - utcGuess.getTime();
	return new Date(utcGuess.getTime() - offset);
}
