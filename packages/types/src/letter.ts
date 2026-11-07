import { z } from 'zod';

const idSchema = z.string().uuid();

// 'attached': el adjunto foto de esta carta se registró como comprobante de
// pago (payment.receipt_from_letter) — sale de la revisión pero queda con traza.
export const LETTER_STATUSES = ['pending', 'approved', 'hidden', 'attached'] as const;
export type LetterStatus = (typeof LETTER_STATUSES)[number];

export const LetterAttachmentSchema = z.object({
	id: idSchema,
	letterId: idSchema,
	fileName: z.string(),
	mimeType: z.string(),
	sizeBytes: z.number().int().nonnegative(),
	isBrowserSafeImage: z.boolean(),
	// URL ya presignada por el API (TTL corto); el web no firma nada.
	storageUrl: z.string(),
	sortOrder: z.number().int(),
	createdAt: z.coerce.date(),
});
export type LetterAttachment = z.infer<typeof LetterAttachmentSchema>;

export const LetterSchema = z.object({
	id: idSchema,
	retreatId: idSchema,
	retreatParticipantId: idSchema,
	participantId: idSchema.nullable().optional(),
	participantName: z.string().optional(),
	tableId: idSchema.nullable().optional(),
	tableName: z.string().nullable().optional(),
	fromEmail: z.string(),
	fromName: z.string().nullable().optional(),
	subject: z.string().nullable().optional(),
	bodyText: z.string(),
	status: z.enum(LETTER_STATUSES),
	receivedAt: z.coerce.date(),
	warnings: z.array(z.string()).nullable().optional(),
	reviewedAt: z.coerce.date().nullable().optional(),
	printedAt: z.coerce.date().nullable().optional(),
	printedBatchId: z.string().nullable().optional(),
	attachments: z.array(LetterAttachmentSchema).optional(),
});
export type Letter = z.infer<typeof LetterSchema>;

// -- Request schemas (formato {body, params, query} de validateRequest) --

export const ActivateLetterMailboxesSchema = z.object({
	params: z.object({ retreatId: idSchema }),
});
export type ActivateLetterMailboxes = z.infer<typeof ActivateLetterMailboxesSchema>;

export const UpdateLetterMailboxSchema = z.object({
	params: z.object({ retreatId: idSchema, retreatParticipantId: idSchema }),
	body: z.object({ mailboxEnabled: z.boolean() }),
});
export type UpdateLetterMailbox = z.infer<typeof UpdateLetterMailboxSchema>;

/** Marca de difusión: la dirección del buzón ya se mandó a la familia. */
export const MarkLetterMailboxSharedSchema = z.object({
	params: z.object({ retreatId: idSchema, retreatParticipantId: idSchema }),
});
export type MarkLetterMailboxShared = z.infer<typeof MarkLetterMailboxSharedSchema>;

// Query params llegan como strings; tolerar '' para filtros vacíos del frontend.
const optionalIdQuery = z.string().uuid().or(z.literal('')).optional();

export const ListLettersQuerySchema = z.object({
	params: z.object({ retreatId: idSchema }),
	query: z.object({
		participantId: optionalIdQuery,
		retreatParticipantId: optionalIdQuery,
		tableId: optionalIdQuery,
		status: z.enum(LETTER_STATUSES).or(z.literal('')).optional(),
		q: z.string().max(200).optional(),
	}),
});
export type ListLettersQuery = z.infer<typeof ListLettersQuerySchema>;

export const ReviewLetterSchema = z.object({
	params: z.object({ id: idSchema }),
	body: z.object({ status: z.enum(['approved', 'hidden']) }),
});
export type ReviewLetter = z.infer<typeof ReviewLetterSchema>;

export const MarkLettersPrintedSchema = z.object({
	params: z.object({ retreatId: idSchema }),
	body: z.object({
		letterIds: z.array(idSchema).min(1).max(2000),
		batchId: idSchema,
	}),
});
export type MarkLettersPrinted = z.infer<typeof MarkLettersPrintedSchema>;

export const PrintBatchQuerySchema = z.object({
	params: z.object({ retreatId: idSchema }),
	query: z.object({
		scope: z.enum(['participant', 'table', 'retreat']),
		participantIds: z.string().optional(), // csv de participantIds para scope=participant
		tableId: optionalIdQuery,
	}),
});
export type PrintBatchQuery = z.infer<typeof PrintBatchQuerySchema>;

// -- Webhook (contrato del Worker de Cloudflare, specs/letters-email plan.md) --
// La validación de tamaños/topes la hace el controller a mano (para distinguir
// 413 de 400); este schema fija la forma del payload.

export const InboundLetterAttachmentSchema = z.object({
	fileName: z.string().min(1).max(255),
	mimeType: z.string().min(1).max(100),
	contentBase64: z.string().min(1),
});
export type InboundLetterAttachment = z.infer<typeof InboundLetterAttachmentSchema>;

export const InboundLetterPayloadSchema = z.object({
	messageId: z.string().min(1).max(998).nullable().optional(),
	from: z.string().min(3).max(320),
	fromName: z.string().max(200).nullable().optional(),
	to: z.string().min(3).max(320),
	subject: z.string().max(998).nullable().optional(),
	text: z.string().max(500_000).nullable().optional(),
	html: z.string().max(2_000_000).nullable().optional(),
	receivedAt: z.coerce.date().optional(),
	attachments: z.array(InboundLetterAttachmentSchema).max(10).optional(),
});
export type InboundLetterPayload = z.infer<typeof InboundLetterPayloadSchema>;

// -- DTOs de respuestas --

export interface LetterMailboxRow {
	retreatParticipantId: string;
	participantId: string | null;
	participantName: string;
	participantType: string | null;
	tableId: string | null;
	tableName: string | null;
	cellPhone: string | null;
	mailboxCode: string | null;
	mailboxAddress: string | null;
	mailboxEnabled: boolean;
	/** Cuándo se mandó a la familia (marca de difusión, mejora 9). */
	mailboxSharedAt: string | null;
	letterCounts: { pending: number; approved: number; hidden: number };
}

export interface LetterPrintBatchEntry {
	retreatParticipantId: string;
	participantId: string | null;
	participantName: string;
	idOnRetreat: number | null;
	tableName: string | null;
	tableSortKey: string;
	letters: Letter[];
}
