/**
 * Utility functions for meeting flyer template variable replacement
 */

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

/**
 * Formats the full community address
 */
export function formatCommunityAddress(community: {
	address1: string;
	address2?: string | null;
	city: string;
	state: string;
	zipCode: string;
	country: string;
}): string {
	const parts = [
		community.address1,
		community.address2,
		community.city,
		community.state,
		community.zipCode,
		community.country,
	].filter((part) => part && part.trim());
	return parts.join(', ');
}
