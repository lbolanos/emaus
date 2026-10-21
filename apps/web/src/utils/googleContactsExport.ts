import { toE164Phone } from './phone';

/**
 * CSV listo para contacts.google.com → Importar, con los participantes de un
 * retiro como contactos de teléfono.
 *
 * El formato está fijado por Google (es el que el propio Google Contacts
 * exporta) y fue validado a mano con el retiro Buen Despacho (2026-10-20):
 *
 * - `Name` Y `Family Name` llevan el identificador: Google reconstruye el
 *   nombre visible desde Given+Family al importar, así que ponerlo sólo en
 *   `Name` lo pierde. `Given Name` queda limpio para ordenar/buscabilidad.
 * - `Phone 1 - Value` va en E.164 (`+52…`) — ver `toE164Phone`.
 * - `Group Membership` = `<identificador> ::: * myContacts`: crea la etiqueta
 *   y los deja en *Mis contactos* para que sincronicen al teléfono.
 * - BOM UTF-8 + CRLF, como los export de Google Contacts.
 */
export interface GoogleContactsParticipant {
	firstName?: string | null;
	lastName?: string | null;
	cellPhone?: string | null;
	country?: string | null;
}

const HEADERS = [
	'Name',
	'Given Name',
	'Family Name',
	'Phone 1 - Type',
	'Phone 1 - Value',
	'Group Membership',
] as const;

const csvEscape = (value: string): string => `"${value.replace(/"/g, '""')}"`;

export function buildGoogleContactsCsv(
	participants: GoogleContactsParticipant[],
	rawSuffix: string,
): string {
	const suffix = rawSuffix.trim();
	if (!suffix) {
		throw new Error('buildGoogleContactsCsv: el identificador no puede estar vacío');
	}

	const lines = [HEADERS.join(',')];
	for (const p of participants) {
		const given = (p.firstName ?? '').trim();
		const familyName = (p.lastName ?? '').trim();
		const family = familyName ? `${familyName} ${suffix}` : suffix;
		const name = given ? `${given} ${family}` : family;
		const phone = toE164Phone(p.cellPhone, p.country);
		lines.push(
			[
				csvEscape(name),
				csvEscape(given),
				csvEscape(family),
				csvEscape('Mobile'),
				csvEscape(phone),
				csvEscape(`${suffix} ::: * myContacts`),
			].join(','),
		);
	}

	// BOM + CRLF: lo que Google Contacts exporta y espera al importar.
	// El BOM se escribe como fromCharCode para no dejar un carácter invisible
	// en el fuente.
	const BOM = String.fromCharCode(0xfeff);
	return BOM + lines.join('\r\n') + '\r\n';
}
