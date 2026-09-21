/**
 * Utility functions for meeting flyer template variable replacement
 */
import { formatDateInCommunityTimezone } from '@repo/utils';

export interface MeetingFlyerData {
	fecha: string;
	hora: string;
	nombre: string;
	descripcion?: string;
	duracion: string;
	ubicacion: string;
	comunidad: string;
}

/**
 * Replaces template variables with actual meeting data
 * Supported variables:
 * - {{fecha}} - Full date/time
 * - {{hora}} - Start time
 * - {{nombre}} - Meeting title
 * - {{descripcion}} - Description
 * - {{duracion}} - Duration
 * - {{ubicacion}} - Community address
 * - {{comunidad}} - Community name
 */
export function replaceFlyerVariables(
	template: string | undefined,
	data: MeetingFlyerData,
): string {
	let result = template || getDefaultTemplate();
	result = result.replace(/\{\{fecha\}\}/g, data.fecha);
	result = result.replace(/\{\{hora\}\}/g, data.hora);
	result = result.replace(/\{\{nombre\}\}/g, data.nombre);
	result = result.replace(/\{\{descripcion\}\}/g, data.descripcion || '');
	result = result.replace(/\{\{duracion\}\}/g, data.duracion);
	result = result.replace(/\{\{ubicacion\}\}/g, data.ubicacion);
	result = result.replace(/\{\{comunidad\}\}/g, data.comunidad);
	return result;
}

/**
 * Returns the default flyer template when none is provided
 */
export function getDefaultTemplate(): string {
	return `{{nombre}}

{{fecha}} - {{hora}}
Duración: {{duracion}}

{{descripcion}}

Ubicación:
{{ubicacion}}

{{comunidad}}`;
}

/**
 * Formats duration in minutes to a human-readable string
 * Examples: 60 min -> "1 hora", 90 min -> "1 hora 30 minutos", 45 min -> "45 minutos"
 */
export function formatDuration(minutes: number): string {
	if (minutes < 60) {
		return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
	}
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	const hoursText = `${hours} ${hours === 1 ? 'hora' : 'horas'}`;
	if (remainingMinutes === 0) {
		return hoursText;
	}
	return `${hoursText} ${remainingMinutes} ${remainingMinutes === 1 ? 'minuto' : 'minutos'}`;
}

/**
 * Formats date to Spanish long format with time. Si se pasa la comunidad, el
 * formateo respeta su IANA timezone (importante para el flyer: la hora del
 * meeting es local al lugar físico, no al browser del coordinador).
 * Example: "viernes, 15 de enero de 2026, 5:00 PM"
 */
export function formatMeetingDate(
	date: Date | string,
	community?: { timezone?: string | null } | null,
): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	const timeZone = community?.timezone || 'America/Mexico_City';
	return d.toLocaleString('es-ES', {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZone,
	});
}

/**
 * Formats just the time portion. Si se pasa la comunidad, usa su IANA timezone.
 * Example: "5:00 PM"
 */
export function formatMeetingTime(
	date: Date | string,
	community?: { timezone?: string | null } | null,
): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	const timeZone = community?.timezone || 'America/Mexico_City';
	return d.toLocaleTimeString('es-ES', {
		hour: '2-digit',
		minute: '2-digit',
		timeZone,
	});
}

/** Spanish connectors that stay lowercase inside a displayed title. */
const LOWERCASE_CONNECTORS = new Set([
	'de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'o', 'u',
	'en', 'a', 'al', 'con', 'sin', 'por', 'para', 's/n',
]);

function hasInnerUppercase(word: string): boolean {
	return word.slice(1) !== word.slice(1).toLowerCase();
}

/**
 * Display-only casing for flyer copy: community names and addresses are
 * often typed in a hurry ("Buen despacho") and the flyer is public-facing
 * material. Capitalizes lowercase words, keeps connectors lowercase, and
 * never rewrites a word that already carries capitals beyond the first
 * letter ("CDMX", "AV.", "McOebel") — that casing was chosen on purpose.
 */
export function titleCaseForDisplay(text: string): string {
	return text
		.split(/\s+/)
		.filter(Boolean)
		.map((word, index) => {
			if (hasInnerUppercase(word)) return word;
			const lower = word.toLowerCase();
			if (index > 0 && LOWERCASE_CONNECTORS.has(lower)) return lower;
			return lower.charAt(0).toUpperCase() + lower.slice(1);
		})
		.join(' ');
}

/**
 * Formats the full community address for flyers and template previews.
 * - Drops the state when it repeats the city ("Ciudad de México, Ciudad de México").
 * - Drops the country for the home market ("Mexico"/"México"): a meeting flyer
 *   targets the community's own city, and the English spelling reads like a bug
 *   in Spanish copy. Other countries are kept.
 */
export function formatCommunityAddress(community: {
	address1: string;
	address2?: string | null;
	city: string;
	state: string;
	zipCode: string;
	country: string;
}): string {
	const city = community.city?.trim();
	const country = community.country?.trim();
	// Display casing is normalized per part: see titleCaseForDisplay.
	const parts = [
		titleCaseForDisplay(community.address1 ?? ''),
		community.address2 ? titleCaseForDisplay(community.address2) : undefined,
		city ? titleCaseForDisplay(city) : undefined,
		// Avoid rendering "Ciudad de México, Ciudad de México" when city === state.
		community.state?.trim()?.toLowerCase() !== city?.toLowerCase()
			? titleCaseForDisplay(community.state ?? '')
			: undefined,
		community.zipCode,
		/^m[ée]xico$/i.test(country ?? '') ? undefined : country ? titleCaseForDisplay(country) : undefined,
	].filter((part) => part && part.trim());
	return parts.join(', ');
}

/**
 * Flyer date line: long weekday + date in the community's TZ, without year or
 * time. "miércoles, 23 de septiembre de 2026" → "miércoles, 23 de septiembre".
 * Note: 'date-long' preset (date-only). Passing dateStyle alone inherits
 * timeStyle from the default 'datetime-short' preset and appends the time.
 * The connector "de" must go with the year, or it dangles at the end.
 */
export function formatMeetingDateOnly(
	date: Date | string,
	community?: { timezone?: string | null } | null,
): string {
	return formatDateInCommunityTimezone(date, community, {
		locale: 'es-ES',
		preset: 'date-long',
	}).replace(/\s+de\s+\d{4}\s*$/, '');
}

/**
 * Flyer time line ("19:45") in the community's TZ. Callers append the unit
 * ("hrs.") so every flyer style renders it identically.
 */
export function formatMeetingTimeOnly(
	date: Date | string,
	community?: { timezone?: string | null } | null,
): string {
	return formatDateInCommunityTimezone(date, community, {
		locale: 'es-ES',
		preset: 'time',
	});
}
