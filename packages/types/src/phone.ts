/**
 * Validación de teléfonos por país (ISO-2).
 *
 * La regla la define el país del retiro (la casa). Un teléfono válido contiene
 * únicamente dígitos (sin letras, espacios ni símbolos) y, si el país está en la
 * tabla, debe tener exactamente la cantidad de dígitos esperada.
 */

/**
 * Longitud (en dígitos) válida del número telefónico nacional por país (ISO-2).
 * Algunos países aceptan más de una longitud (línea fija vs. móvil).
 */
export const PHONE_DIGIT_LENGTHS_BY_COUNTRY: Record<string, number[]> = {
	MX: [10], // México
	CO: [10], // Colombia
	US: [10], // Estados Unidos
	CA: [10], // Canadá
	AR: [10], // Argentina
	VE: [10], // Venezuela
	DO: [10], // República Dominicana
	PR: [10], // Puerto Rico
	PE: [9], // Perú
	CL: [9], // Chile
	EC: [9], // Ecuador
	ES: [9], // España
	PY: [9], // Paraguay
	GT: [8], // Guatemala
	SV: [8], // El Salvador
	HN: [8], // Honduras
	NI: [8], // Nicaragua
	CR: [8], // Costa Rica
	BO: [8], // Bolivia
	UY: [8], // Uruguay
	PA: [7, 8], // Panamá (fijo / móvil)
	BR: [10, 11], // Brasil (fijo / móvil con 9)
};

/**
 * Alias de nombre de país (normalizado: minúsculas, sin acentos) → código ISO-2.
 * El país de la casa se captura como texto libre (ej. "México", "Mexico",
 * "Colombia"), por lo que hay que resolverlo a ISO antes de buscar su regla.
 */
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
	mexico: 'MX',
	colombia: 'CO',
	'estados unidos': 'US',
	'estados unidos de america': 'US',
	'united states': 'US',
	usa: 'US',
	eua: 'US',
	canada: 'CA',
	argentina: 'AR',
	venezuela: 'VE',
	'republica dominicana': 'DO',
	'dominican republic': 'DO',
	'puerto rico': 'PR',
	peru: 'PE',
	chile: 'CL',
	ecuador: 'EC',
	espana: 'ES',
	spain: 'ES',
	paraguay: 'PY',
	guatemala: 'GT',
	'el salvador': 'SV',
	honduras: 'HN',
	nicaragua: 'NI',
	'costa rica': 'CR',
	bolivia: 'BO',
	uruguay: 'UY',
	panama: 'PA',
	brasil: 'BR',
	brazil: 'BR',
};

/** Minúsculas + trim + sin acentos, para comparar nombres de país de forma robusta. */
function normalizeCountryName(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '');
}

/**
 * Resuelve un país (ISO-2 o nombre en español/inglés) a su código ISO-2,
 * o `null` si no se reconoce.
 */
export function resolveCountryToIso(country?: string | null): string | null {
	if (!country) return null;
	const raw = country.trim();
	if (raw === '') return null;
	const upper = raw.toUpperCase();
	if (PHONE_DIGIT_LENGTHS_BY_COUNTRY[upper]) return upper; // ya viene como ISO-2
	return COUNTRY_NAME_TO_ISO[normalizeCountryName(raw)] ?? null;
}

/**
 * Devuelve las longitudes válidas para un país (ISO-2 o nombre),
 * o `null` si no hay regla definida.
 */
export function getPhoneDigitLengths(country?: string | null): number[] | null {
	const iso = resolveCountryToIso(country);
	if (!iso) return null;
	const lengths = PHONE_DIGIT_LENGTHS_BY_COUNTRY[iso];
	return lengths && lengths.length > 0 ? lengths : null;
}

const DIGITS_ONLY_REGEX = /^[0-9]+$/;

/** Separadores de formato que se eliminan al normalizar: espacios, guiones, paréntesis, puntos y `+`. */
const PHONE_SEPARATORS_REGEX = /[\s().\-+]/g;

/**
 * Normaliza un teléfono quitando separadores de formato comunes (espacios,
 * guiones, paréntesis, puntos, `+`). NO elimina letras: un teléfono con letras
 * sigue siendo inválido para que el mensaje "solo números" tenga sentido.
 * Es el valor que se persiste en la base.
 */
export function normalizePhone(value: string | null | undefined): string {
	if (value == null) return '';
	return value.replace(PHONE_SEPARATORS_REGEX, '');
}

export type PhoneValidationErrorCode = 'not_digits' | 'wrong_length';

export interface PhoneValidationResult {
	valid: boolean;
	error?: PhoneValidationErrorCode;
	expectedLengths?: number[];
}

/**
 * Valida un teléfono según el país (ISO-2 o nombre). El valor se normaliza
 * primero (se quitan espacios/guiones/paréntesis/puntos/`+`), por lo que
 * `55 1234 5678` se acepta como 10 dígitos. Vacío/ausente = válido: la
 * obligatoriedad de cada campo se maneja por separado en los schemas.
 */
export function validatePhoneForCountry(
	value: string | null | undefined,
	country?: string | null,
): PhoneValidationResult {
	if (value == null) return { valid: true };
	const normalized = normalizePhone(value);
	if (normalized === '') return { valid: true };
	if (!DIGITS_ONLY_REGEX.test(normalized)) {
		return { valid: false, error: 'not_digits' };
	}
	const lengths = getPhoneDigitLengths(country);
	if (lengths && !lengths.includes(normalized.length)) {
		return { valid: false, error: 'wrong_length', expectedLengths: lengths };
	}
	return { valid: true };
}

/**
 * Mensaje en español listo para mostrar al usuario, o `null` si el teléfono es válido.
 */
export function phoneValidationMessage(result: PhoneValidationResult): string | null {
	if (result.valid) return null;
	if (result.error === 'not_digits') {
		return 'El teléfono solo puede contener números (sin letras ni espacios).';
	}
	if (result.error === 'wrong_length') {
		const lengths = result.expectedLengths ?? [];
		const label =
			lengths.length <= 1
				? `${lengths[0] ?? 0} dígitos`
				: `${lengths.slice(0, -1).join(', ')} o ${lengths[lengths.length - 1]} dígitos`;
		return `El teléfono debe tener ${label} (solo números).`;
	}
	return 'Teléfono inválido.';
}

/**
 * Campos de teléfono de un participante: propios + contactos de emergencia + invitador.
 */
export const PARTICIPANT_PHONE_FIELDS = [
	'homePhone',
	'workPhone',
	'cellPhone',
	'emergencyContact1HomePhone',
	'emergencyContact1WorkPhone',
	'emergencyContact1CellPhone',
	'emergencyContact2HomePhone',
	'emergencyContact2WorkPhone',
	'emergencyContact2CellPhone',
	'inviterHomePhone',
	'inviterWorkPhone',
	'inviterCellPhone',
] as const;

export type ParticipantPhoneField = (typeof PARTICIPANT_PHONE_FIELDS)[number];

/**
 * Valida todos los teléfonos de un participante contra el país del retiro.
 * Devuelve un error por cada campo inválido (campo + mensaje legible).
 */
export function validateParticipantPhones(
	data: Partial<Record<ParticipantPhoneField, string | null | undefined>>,
	country?: string | null,
): Array<{ field: ParticipantPhoneField; message: string }> {
	const errors: Array<{ field: ParticipantPhoneField; message: string }> = [];
	for (const field of PARTICIPANT_PHONE_FIELDS) {
		const result = validatePhoneForCountry(data[field], country);
		if (!result.valid) {
			errors.push({ field, message: phoneValidationMessage(result)! });
		}
	}
	return errors;
}

/**
 * Devuelve una copia del objeto con todos los campos de teléfono presentes
 * normalizados (solo dígitos, sin separadores). Solo toca los campos que
 * existen en el objeto; el resto de propiedades se conservan intactas.
 * Úsalo antes de persistir para guardar el teléfono normalizado en la base.
 */
export function normalizeParticipantPhones<
	T extends Partial<Record<ParticipantPhoneField, string | null | undefined>>,
>(data: T): T {
	const out: T = { ...data };
	for (const field of PARTICIPANT_PHONE_FIELDS) {
		const value = data[field];
		if (typeof value === 'string') {
			(out as Record<string, unknown>)[field] = normalizePhone(value);
		}
	}
	return out;
}
