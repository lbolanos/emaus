import { z } from 'zod';

const idSchema = z.string().uuid();

export const PAYMENT_RECEIPT_CLAIM_STATUSES = ['pending', 'attached', 'dismissed'] as const;
export type PaymentReceiptClaimStatus = (typeof PAYMENT_RECEIPT_CLAIM_STATUSES)[number];

const PAYMENT_METHODS = ['cash', 'transfer', 'check', 'card', 'other'] as const;
const PAYMENT_METHOD_SCHEMA = z.enum(PAYMENT_METHODS);

export const PaymentReceiptClaimSchema = z.object({
	id: idSchema,
	retreatId: idSchema,
	participantId: idSchema,
	participantName: z.string().optional(),
	participantBalance: z.number().nullable().optional(),
	status: z.enum(PAYMENT_RECEIPT_CLAIM_STATUSES),
	amountClaimed: z.number().nullable().optional(),
	reference: z.string().nullable().optional(),
	note: z.string().nullable().optional(),
	senderContact: z.string().nullable().optional(),
	// URL ya presignada por el API (TTL corto); el web no firma nada.
	photoUrl: z.string(),
	attachedPaymentId: idSchema.nullable().optional(),
	attachedAt: z.coerce.date().nullable().optional(),
	createdAt: z.coerce.date(),
});
export type PaymentReceiptClaim = z.infer<typeof PaymentReceiptClaimSchema>;

// -- Request schemas (formato {body, params, query} de validateRequest) --

/**
 * Subida PÚBLICA desde el link de capacidad: la foto llega como data-URL
 * (el cliente la redimensiona a ≤2MB) y el servidor la reprocesa
 * (magic bytes + resize) — no se confía en lo que manda el navegador.
 */
export const SubmitPaymentReceiptClaimSchema = z.object({
	params: z.object({ token: z.string().min(10).max(500) }),
	body: z.object({
		photo: z.string().startsWith('data:image/').min(50),
		amountClaimed: z.number().positive().max(1_000_000).optional(),
		reference: z.string().max(255).optional(),
		note: z.string().max(2000).optional(),
		senderContact: z.string().max(320).optional(),
	}),
});
export type SubmitPaymentReceiptClaim = z.infer<typeof SubmitPaymentReceiptClaimSchema>;

export const ListReceiptClaimsQuerySchema = z.object({
	params: z.object({}),
	query: z.object({
		// El retreatId llega por query (requireRetreatAccess source='query').
		retreatId: idSchema,
		status: z.enum(PAYMENT_RECEIPT_CLAIM_STATUSES).or(z.literal('')).optional(),
	}),
});
export type ListReceiptClaimsQuery = z.infer<typeof ListReceiptClaimsQuerySchema>;

const applyPaymentBody = z.object({
	amount: z.number().positive().max(1_000_000),
	paymentMethod: PAYMENT_METHOD_SCHEMA.optional(),
	paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
	reference: z.string().max(255).optional(),
	notes: z.string().max(1000).optional(),
});

export const ApplyPaymentReceiptClaimSchema = z.object({
	params: z.object({ id: idSchema }),
	body: applyPaymentBody,
});
export type ApplyPaymentReceiptClaim = z.infer<typeof ApplyPaymentReceiptClaimSchema>;

export const DismissPaymentReceiptClaimSchema = z.object({
	params: z.object({ id: idSchema }),
});
export type DismissPaymentReceiptClaim = z.infer<typeof DismissPaymentReceiptClaimSchema>;

/** Registrar el adjunto foto de una CARTA como comprobante de pago. */
export const PaymentFromLetterSchema = z.object({
	params: z.object({ letterId: idSchema }),
	body: applyPaymentBody,
});
export type PaymentFromLetter = z.infer<typeof PaymentFromLetterSchema>;

/**
 * Foto de una carta lista para el formulario de pago estándar (data-URL desde
 * el servidor: bajarla del bucket con fetch desde el navegador depende del
 * CORS de S3 y falla en silencio).
 */
export const LetterReceiptPhotoSchema = z.object({
	params: z.object({ letterId: idSchema }),
});

/** Sella la carta `attached` con el pago que creó el formulario estándar. */
export const AttachLetterToPaymentSchema = z.object({
	params: z.object({ letterId: idSchema }),
	body: z.object({ paymentId: idSchema }),
});
export type AttachLetterToPayment = z.infer<typeof AttachLetterToPaymentSchema>;

export const ReceiptLinksQuerySchema = z.object({
	params: z.object({ retreatId: idSchema }),
});
export type ReceiptLinksQuery = z.infer<typeof ReceiptLinksQuerySchema>;
