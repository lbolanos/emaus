import crypto from 'crypto';

/**
 * Token cifrado stateless para el link de subida de comprobante de pago
 * (comprobantes por link — specs/payment-receipt-photo + plan comprobantes).
 *
 * Copia técnica exacta de `santisimoInviteToken.ts` (AES-256-GCM, clave
 * derivada por HMAC con label de dominio propio — rotar el secret invalida
 * solo estos links). Capability URL: quien lo tiene puede enviar un
 * comprobante a nombre de ese participante. Nunca se loguea ni se persiste.
 */

const TOKEN_VERSION = 1;
const KEY_LABEL = 'payment-receipt-link-v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface PaymentReceiptLinkPayload {
	retreatId: string;
	participantId: string;
}

function deriveKey(): Buffer {
	const secret = process.env.INVITE_TOKEN_SECRET || process.env.SESSION_SECRET;
	if (!secret) {
		throw new Error(
			'INVITE_TOKEN_SECRET or SESSION_SECRET is required for payment receipt link tokens',
		);
	}
	return crypto.createHmac('sha256', secret).update(KEY_LABEL).digest();
}

export function buildPaymentReceiptLinkToken(retreatId: string, participantId: string): string {
	const iv = crypto.randomBytes(IV_BYTES);
	const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
	const plaintext = Buffer.from(
		JSON.stringify({ v: TOKEN_VERSION, r: retreatId, p: participantId }),
		'utf8',
	);
	const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

/**
 * Devuelve el payload o null ante CUALQUIER fallo (token alterado, base64
 * inválido, clave rotada, versión distinta). Nunca lanza: el caller traduce
 * el null al 404 uniforme del enlace.
 */
export function parsePaymentReceiptLinkToken(token: string): PaymentReceiptLinkPayload | null {
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

/** URL pública del link de comprobante (la vista `comprobante/:token`). */
export function buildPaymentReceiptLinkUrl(
	baseUrl: string,
	retreatId: string,
	participantId: string,
): string {
	const base = baseUrl.replace(/\/+$/, '');
	return `${base}/comprobante/${buildPaymentReceiptLinkToken(retreatId, participantId)}`;
}
