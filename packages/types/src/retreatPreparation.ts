import { z } from 'zod';

const idSchema = z.string().uuid();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)');
const timeOnly = z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida (HH:MM)');

export const RetreatPreparationTypeSchema = z.enum(['session', 'break']);
export type RetreatPreparationType = z.infer<typeof RetreatPreparationTypeSchema>;

export const PreparationDocumentKindSchema = z.enum(['file', 'markdown']);
export type PreparationDocumentKind = z.infer<typeof PreparationDocumentKindSchema>;

export const RetreatPreparationDocumentSchema = z.object({
	id: idSchema,
	preparationId: idSchema,
	kind: PreparationDocumentKindSchema.default('file'),
	content: z.string().nullable().optional(),
	fileName: z.string(),
	mimeType: z.string(),
	sizeBytes: z.number().int(),
	url: z.string(),
	sortOrder: z.number().int().default(0),
	createdAt: z.coerce.date(),
});
export type RetreatPreparationDocument = z.infer<typeof RetreatPreparationDocumentSchema>;

export const RetreatPreparationSchema = z.object({
	id: idSchema,
	retreatId: idSchema,
	type: RetreatPreparationTypeSchema.default('session'),
	weekNumber: z.number().int().min(1).nullable().optional(),
	title: z.string().min(1),
	description: z.string().nullable().optional(),
	// Date-only + hora local del retiro (nunca Date: bug TZ conocido)
	date: dateOnly.nullable().optional(),
	time: timeOnly.nullable().optional(),
	sortOrder: z.number().int().default(0),
	documents: z.array(RetreatPreparationDocumentSchema).optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});
export type RetreatPreparation = z.infer<typeof RetreatPreparationSchema>;

// Base de escritura: sin id/retreatId/documents/timestamps (campos read-only
// o derivados — el cliente nunca debe reenviarlos; ver guard de write schemas).
const preparationWriteBase = z.object({
	type: RetreatPreparationTypeSchema.default('session'),
	weekNumber: z.number().int().min(1).nullable().optional(),
	title: z.string().min(1).max(200),
	description: z.string().max(2000).nullable().optional(),
	date: dateOnly.nullable().optional(),
	time: timeOnly.nullable().optional(),
	sortOrder: z.number().int().optional(),
});

export const CreateRetreatPreparationSchema = z.object({
	body: preparationWriteBase,
	params: z.object({ retreatId: idSchema }),
});
export type CreateRetreatPreparation = z.infer<typeof CreateRetreatPreparationSchema>;

export const UpdateRetreatPreparationSchema = z.object({
	body: preparationWriteBase.partial(),
	params: z.object({ id: idSchema }),
});
export type UpdateRetreatPreparation = z.infer<typeof UpdateRetreatPreparationSchema>;

export const GenerateRetreatPreparationsSchema = z.object({
	body: z.object({
		weeks: z.number().int().min(1).max(12),
		firstDate: dateOnly,
		time: timeOnly,
		clearExisting: z.boolean().default(false).optional(),
		// Adjunta a cada semana los documentos por defecto (serie IX).
		includeDefaultDocs: z.boolean().default(true).optional(),
	}),
	params: z.object({ retreatId: idSchema }),
});
export type GenerateRetreatPreparations = z.infer<typeof GenerateRetreatPreparationsSchema>;

export const SkipRetreatPreparationSchema = z.object({
	body: z.object({
		reason: z.string().max(200).optional(),
	}),
	params: z.object({ id: idSchema }),
});
export type SkipRetreatPreparation = z.infer<typeof SkipRetreatPreparationSchema>;

export const UploadRetreatPreparationDocumentSchema = z.object({
	body: z.object({
		fileName: z.string().min(1).max(200),
		mimeType: z.string().min(1).max(120),
		dataUrl: z.string().min(1),
	}),
	params: z.object({ id: idSchema }),
});
export type UploadRetreatPreparationDocument = z.infer<
	typeof UploadRetreatPreparationDocumentSchema
>;

// Documento de texto (markdown) editable in-app — mismo modelo que los docs
// de responsabilidades.
export const CreateRetreatPreparationMarkdownSchema = z.object({
	body: z.object({
		title: z.string().min(1).max(200),
		content: z.string().default(''),
	}),
	params: z.object({ id: idSchema }),
});
export type CreateRetreatPreparationMarkdown = z.infer<
	typeof CreateRetreatPreparationMarkdownSchema
>;

export const UpdateRetreatPreparationMarkdownSchema = z.object({
	body: z.object({
		title: z.string().min(1).max(200).optional(),
		content: z.string().optional(),
	}),
	params: z.object({ docId: idSchema }),
});
export type UpdateRetreatPreparationMarkdown = z.infer<
	typeof UpdateRetreatPreparationMarkdownSchema
>;

// Payload de la vista pública (sin auth)
export const PublicRetreatPreparationsSchema = z.object({
	retreat: z.object({
		id: idSchema,
		parish: z.string().nullable().optional(),
		startDate: z.coerce.date().nullable().optional(),
		endDate: z.coerce.date().nullable().optional(),
	}),
	preparations: z.array(RetreatPreparationSchema),
});
export type PublicRetreatPreparations = z.infer<typeof PublicRetreatPreparationsSchema>;
