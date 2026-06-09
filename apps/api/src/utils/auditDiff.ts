/**
 * Utilidades para construir `oldValues`/`newValues` compactos para la auditoría de dominio.
 *
 * Objetivos:
 *  - Registrar SOLO los campos que cambiaron (no la entidad completa) → minimiza el
 *    tamaño de la tabla y de los NDJSON.
 *  - Nunca filtrar secretos (passwords, tokens, hashes) a la auditoría.
 */

/**
 * Campos que NUNCA deben llegar a la auditoría (secretos / credenciales).
 * Se comparan en minúsculas e ignoran mayúsculas.
 */
const SECRET_FIELDS = new Set(
	[
		'password',
		'passwordHash',
		'password_hash',
		'salt',
		'token',
		'refreshToken',
		'accessToken',
		'resetToken',
		'verificationToken',
		'csrfToken',
		'sessionToken',
		'apiKey',
		'secret',
		'googleId',
	].map((f) => f.toLowerCase()),
);

function isSecretField(field: string): boolean {
	return SECRET_FIELDS.has(field.toLowerCase());
}

/** ¿Es un valor "simple" comparable de forma confiable con `===`? */
function isComparable(v: unknown): boolean {
	return v === null || v === undefined || ['string', 'number', 'boolean'].includes(typeof v);
}

/** Normaliza Date → ISO para comparar y registrar de forma estable. */
function normalize(v: unknown): unknown {
	if (v instanceof Date) return v.toISOString();
	return v;
}

export interface FieldDiff {
	from: unknown;
	to: unknown;
}

/**
 * Compara `oldObj` vs `newObj` y devuelve solo los campos cambiados como
 * `{ campo: { from, to } }`. Ignora campos secretos y objetos/relaciones anidadas
 * (solo compara valores escalares). Devuelve `null` si no hubo cambios registrables.
 *
 * @param fields lista opcional de campos a considerar (allowlist). Si se omite, se
 *               consideran las claves de `newObj`.
 */
export function diffFields(
	oldObj: Record<string, any> | null | undefined,
	newObj: Record<string, any> | null | undefined,
	fields?: string[],
): Record<string, FieldDiff> | null {
	if (!oldObj || !newObj) return null;
	const keys = fields ?? Object.keys(newObj);
	const diff: Record<string, FieldDiff> = {};

	for (const key of keys) {
		if (isSecretField(key)) continue;
		const before = normalize(oldObj[key]);
		const after = normalize(newObj[key]);
		// Solo comparamos escalares; saltamos objetos/arrays/relaciones para no inflar.
		if (!isComparable(before) || !isComparable(after)) continue;
		if (before !== after) {
			diff[key] = { from: oldObj[key] ?? null, to: newObj[key] ?? null };
		}
	}

	return Object.keys(diff).length > 0 ? diff : null;
}

/**
 * Devuelve una copia de `obj` con solo los campos escalares no-secretos. Útil para
 * snapshots compactos de `newValues` (create) u `oldValues` (delete).
 */
export function sanitizeSnapshot(
	obj: Record<string, any> | null | undefined,
	fields?: string[],
): Record<string, any> | null {
	if (!obj) return null;
	const keys = fields ?? Object.keys(obj);
	const out: Record<string, any> = {};
	for (const key of keys) {
		if (isSecretField(key)) continue;
		const value = normalize(obj[key]);
		if (isComparable(value)) out[key] = obj[key] ?? null;
	}
	return Object.keys(out).length > 0 ? out : null;
}
