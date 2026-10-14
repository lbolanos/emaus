import crypto from 'crypto';

/**
 * Token cifrado stateless para el enlace personal de guardias del Santísimo.
 *
 * Cifra `{ retreatId, participantId }` con AES-256-GCM. La clave se deriva por
 * HMAC del secret de sesión (o uno dedicado) con un label de dominio, así
 * rotar `INVITE_TOKEN_SECRET` invalida todos los enlaces sin tocar las
 * sesiones. Es un patrón nuevo en el repo — el convenio existente es token
 * opaco guardado en DB (`cancelToken`, `dataDeleteToken`) — decidido así en
 * specs/santisimo-guardia-links/spec.md (decisión 4).
 *
 * El token es una capability URL: quien lo tiene puede inscribir/cambiar la
 * guardia de ese servidor. Nunca se loguea ni se persiste.
 */

const TOKEN_VERSION = 1;
const KEY_LABEL = 'santisimo-guardia-invite-v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface SantisimoInvitePayload {
	retreatId: string;
	participantId: string;
}

function deriveKey(): Buffer {
	const secret = process.env.INVITE_TOKEN_SECRET || process.env.SESSION_SECRET;
	if (!secret) {
		// En prod config.ts ya hace fail-fast sin SESSION_SECRET; llegar aquí
		// es un error de configuración, no un 404 del token.
		throw new Error('INVITE_TOKEN_SECRET or SESSION_SECRET is required for santisimo invite tokens');
	}
	return crypto.createHmac('sha256', secret).update(KEY_LABEL).digest();
}

export function buildSantisimoInviteToken(retreatId: string, participantId: string): string {
	const iv = crypto.randomBytes(IV_BYTES);
	const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
	const plaintext = Buffer.from(
		JSON.stringify({ v: TOKEN_VERSION, r: retreatId, p: participantId }),
		'utf8',
	);
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();
	// iv|tag|ciphertext en base64url: seguro para URL de WhatsApp.
	return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

/**
 * Devuelve el payload o null ante CUALQUIER fallo (token alterado, base64
 * inválido, clave rotada, versión distinta). Nunca lanza: el caller traduce
 * el null al 404 uniforme del enlace.
 */
export function parseSantisimoInviteToken(token: string): SantisimoInvitePayload | null {
	try {
		const raw = Buffer.from(token, 'base64url');
		if (raw.length <= IV_BYTES + TAG_BYTES) return null;
		const iv = raw.subarray(0, IV_BYTES);
		const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
		const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
		const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv);
		decipher.setAuthTag(tag);
		const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(
			'utf8',
		);
		const payload = JSON.parse(plaintext);
		if (payload?.v !== TOKEN_VERSION) return null;
		if (typeof payload.r !== 'string' || typeof payload.p !== 'string') return null;
		return { retreatId: payload.r, participantId: payload.p };
	} catch {
		return null;
	}
}

/** URL pública del enlace personal (la vista `public-santisimo-server`). */
export function buildSantisimoInviteUrl(
	baseUrl: string,
	retreatId: string,
	participantId: string,
): string {
	const base = baseUrl.replace(/\/+$/, '');
	return `${base}/santisimo/servidor/${buildSantisimoInviteToken(retreatId, participantId)}`;
}
