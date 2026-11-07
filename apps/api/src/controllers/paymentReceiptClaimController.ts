import { Request, Response } from 'express';
import { domainAuditService } from '../services/domainAuditService';
import { DomainAuditAction } from '@repo/types';
import {
	submitReceiptClaim,
	getReceiptLinkContext,
	getReceiptLinks,
	markReceiptLinkShared,
	listReceiptClaims,
	presignClaimPhotos,
	applyReceiptClaim,
	dismissReceiptClaim,
	PaymentClaimError,
} from '../services/paymentReceiptClaimService';
import {
	SubmitPaymentReceiptClaimSchema,
	ListReceiptClaimsQuerySchema,
	ApplyPaymentReceiptClaimSchema,
	DismissPaymentReceiptClaimSchema,
} from '@repo/types';
import type { SubmitPaymentReceiptClaim } from '@repo/types';
import type { LetterStatus } from '../entities/letter.entity';

/** 404 uniforme: el token de capacidad no revela por qué no sirve. */
const notFound = (res: Response) => res.status(404).json({ message: 'Enlace no válido' });

/** GET público: contexto del link (nombre del caminante + retiro) para el formulario. */
export async function getPublicReceiptLinkContext(req: Request, res: Response) {
	try {
		const context = await getReceiptLinkContext(req.params.token);
		if (!context) return notFound(res);
		res.json(context);
	} catch (error) {
		console.error('getPublicReceiptLinkContext error:', error);
		res.status(500).json({ message: 'Error al validar el enlace' });
	}
}

/** POST público: alta del comprobante (foto procesada por imageService en el service). */
export async function submitPublicReceiptClaim(req: Request, res: Response) {
	try {
		const body = (req as any).body as SubmitPaymentReceiptClaim['body'];
		const result = await submitReceiptClaim(req.params.token, body);
		res.json({ status: 'received', claimId: result.claimId });
	} catch (error) {
		if (error instanceof PaymentClaimError) {
			return res.status(error.httpStatus).json({ error: error.code, message: error.message });
		}
		console.error('submitPublicReceiptClaim error:', error);
		res.status(500).json({ message: 'Error al recibir el comprobante' });
	}
}

/** GET /receipt-links — links por participante para difusión por WhatsApp. */
export async function getReceiptLinksHandler(req: Request, res: Response) {
	try {
		// retreatId llega por QUERY en estas dos rutas (no por params).
		const links = await getReceiptLinks(req.query.retreatId as string);
		res.json({ links });
	} catch (error) {
		console.error('getReceiptLinks error:', error);
		res.status(500).json({ message: 'Error al generar los links' });
	}
}

/**
 * POST /receipt-links/:retreatParticipantId/shared — marca de difusión
 * (mejora 9): el link de comprobante ya se mandó a la familia. El retreatId
 * va por query (mismo patrón que GET /receipt-links) y el service matchea
 * {id, retreatId}: un rp de otro retiro responde 404.
 */
export async function markReceiptLinkSharedHandler(req: Request, res: Response) {
	try {
		const sharedAt = await markReceiptLinkShared(
			req.query.retreatId as string,
			req.params.retreatParticipantId,
		);
		void domainAuditService.log({
			action: DomainAuditAction.PAYMENT_RECEIPT_LINK_MARK_SHARED,
			resourceType: 'payment',
			retreatId: req.query.retreatId as string,
			metadata: { retreatParticipantId: req.params.retreatParticipantId },
		});
		res.json({
			retreatParticipantId: req.params.retreatParticipantId,
			sharedAt,
		});
	} catch (error) {
		if (error instanceof PaymentClaimError) {
			return res.status(error.httpStatus).json({ message: 'Enlace no válido' });
		}
		console.error('markReceiptLinkShared error:', error);
		res.status(500).json({ message: 'Error al marcar la difusión' });
	}
}

/** GET /receipt-claims — bandeja de comprobantes. */
export async function listReceiptClaimsHandler(req: Request, res: Response) {
	try {
		const status = ((req.query.status as string) || '') as LetterStatus | '';
		const claims = await listReceiptClaims(
			req.query.retreatId as string,
			(status as any) || undefined,
		);
		await presignClaimPhotos(claims);
		res.json({ claims });
	} catch (error) {
		console.error('listReceiptClaims error:', error);
		res.status(500).json({ message: 'Error al listar los comprobantes' });
	}
}

/** POST /receipt-claims/:id/apply — crea el pago con la foto seteada. */
export async function applyReceiptClaimHandler(req: Request, res: Response) {
	try {
		const userId = (req as any).user?.id;
		const result = await applyReceiptClaim(req.params.id, req.body, userId);
		res.json({ status: 'applied', ...result });
	} catch (error) {
		if (error instanceof PaymentClaimError) {
			return res.status(error.httpStatus).json({ error: error.code, message: error.message });
		}
		console.error('applyReceiptClaim error:', error);
		res.status(500).json({ message: 'Error al aplicar el comprobante' });
	}
}

/** POST /receipt-claims/:id/dismiss — aparta el claim. */
export async function dismissReceiptClaimHandler(req: Request, res: Response) {
	try {
		const userId = (req as any).user?.id;
		await dismissReceiptClaim(req.params.id, userId);
		res.json({ status: 'dismissed' });
	} catch (error) {
		if (error instanceof PaymentClaimError) {
			return res.status(error.httpStatus).json({ error: error.code, message: error.message });
		}
		console.error('dismissReceiptClaim error:', error);
		res.status(500).json({ message: 'Error al descartar el comprobante' });
	}
}

/** POST /payments/from-letter/:letterId — registra el adjunto foto de una carta. */
export async function createPaymentFromLetterHandler(req: Request, res: Response) {
	try {
		const userId = (req as any).user?.id;
		const { createPaymentFromLetter } = await import(
			'../services/paymentReceiptClaimService'
		);
		const result = await createPaymentFromLetter(req.params.letterId, req.body, userId);
		res.status(201).json({ status: 'created', ...result });
	} catch (error) {
		if (error instanceof PaymentClaimError) {
			return res.status(error.httpStatus).json({ error: error.code, message: error.message });
		}
		console.error('createPaymentFromLetter error:', error);
		res.status(500).json({ message: 'Error al registrar el comprobante de la carta' });
	}
}
