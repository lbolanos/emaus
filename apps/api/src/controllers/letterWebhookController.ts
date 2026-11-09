import { createHash, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import { config } from '../config/env';
import { ingestLetter, LetterIngestError } from '../services/letterService';
import {
	InboundLetterPayloadSchema,
	type InboundLetterPayload,
} from '@repo/types';

// Mismos topes que letterService (D11). Se checan ANTES de ingest para poder
// responder 413 con el código del contrato: el Worker los aplica también, así
// que llegar aquí con exceso solo puede venir de un cliente mal comportado.


const decodedSize = (base64: string): number => Math.floor((base64.length * 3) / 4);

/**
 * Comparación constant-time del secret: se comparan los SHA-256 de ambos
 * valores (longitud fija 32 bytes) para no filtrar la longitud del secret
 * con timingSafeEqual, que lanza si los buffers difieren en tamaño.
 */
const secretMatches = (provided: string | undefined, expected: string): boolean => {
	if (!provided) return false;
	const digestA = createHash('sha256').update(provided).digest();
	const digestB = createHash('sha256').update(expected).digest();
	return timingSafeEqual(digestA, digestB);
};

export const receiveLetterWebhook = async (req: Request, res: Response) => {
	// Fail-closed (D5): sin secret configurado la ruta está apagada.
	const expected = config.letters.webhookSecret;
	if (!expected) {
		return res.status(503).json({ error: 'webhook_not_configured' });
	}
	if (!secretMatches(req.header('X-Emaus-Letter-Secret'), expected)) {
		console.warn('⚠️  Letter webhook: secret inválido o ausente');
		return res.status(401).json({ error: 'unauthorized' });
	}

	const parsed = InboundLetterPayloadSchema.safeParse(req.body);
	if (!parsed.success) {
		return res.status(400).json({ error: 'invalid_payload' });
	}
	const payload: InboundLetterPayload = parsed.data;

	// Sin topes 413 aquí (D11 revisado): la carta NUNCA rebota por tamaño. El
	// schema acota ≤10 adjuntos (400 si excede) y el parser de 32mb cubre el
	// payload; los adjuntos que exceden los descarta ingestLetter CON AVISO en
	// la bandeja — el texto y las fotos que quepan siempre entran.

	try {
		const result = await ingestLetter(payload);
		if (result.duplicate) {
			return res.json({ status: 'duplicate', duplicate: true });
		}
		return res.json({ status: 'accepted', letterId: result.letterId, duplicate: false });
	} catch (error) {
		if (error instanceof LetterIngestError) {
			return res.status(error.httpStatus).json({ error: error.code });
		}
		console.error('Letter webhook ingest error:', error);
		// 500 genérico: el Worker NO rebota en 5xx (solo log; Cloudflare reintenta).
		return res.status(500).json({ error: 'internal_error' });
	}
};
