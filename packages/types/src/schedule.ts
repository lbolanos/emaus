import { z } from 'zod';

const idSchema = z.string().uuid();

export const ScheduleItemTypeSchema = z.enum([
	'charla',
	'testimonio',
	'dinamica',
	'misa',
	'comida',
	'refrigerio',
	'traslado',
	'campana',
	'logistica',
	'santisimo',
	'descanso',
	'oracion',
	'otro',
]);
export type ScheduleItemType = z.infer<typeof ScheduleItemTypeSchema>;

export const ScheduleItemStatusSchema = z.enum([
	'pending',
	'active',
	'completed',
	'delayed',
	'skipped',
]);
export type ScheduleItemStatus = z.infer<typeof ScheduleItemStatusSchema>;

// --- Template sets ---

export const ScheduleTemplateSetSchema = z.object({
	id: idSchema,
	name: z.string().min(1).max(120),
	description: z.string().nullable().optional(),
	sourceTag: z.string().nullable().optional(),
	isActive: z.boolean().default(true),
	isDefault: z.boolean().default(false),
	createdAt: z.coerce.date().optional(),
	updatedAt: z.coerce.date().optional(),
});
export type ScheduleTemplateSetDTO = z.infer<typeof ScheduleTemplateSetSchema>;

export const CreateScheduleTemplateSetSchema = z.object({
	body: ScheduleTemplateSetSchema.omit({ id: true, createdAt: true, updatedAt: true }),
});
export const UpdateScheduleTemplateSetSchema = z.object({
	body: ScheduleTemplateSetSchema.omit({ id: true, createdAt: true, updatedAt: true }).partial(),
	params: z.object({ id: idSchema }),
});

// --- Responsability attachments (globales, vinculados por nombre canónico) ---

export const ResponsabilityAttachmentSchema = z.object({
	id: idSchema,
	responsabilityName: z.string(),
	kind: z.enum(['file', 'markdown']).default('file'),
	fileName: z.string(),
	mimeType: z.string(),
	sizeBytes: z.number().int().nonnegative(),
	storageUrl: z.string(),
	content: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	sortOrder: z.number().int().default(0),
	createdAt: z.coerce.date().optional(),
	updatedAt: z.coerce.date().optional(),
});
export type ResponsabilityAttachmentDTO = z.infer<typeof ResponsabilityAttachmentSchema>;

// --- Global template ---

export const ScheduleTemplateSchema = z.object({
	id: idSchema,
	templateSetId: idSchema.nullable().optional(),
	name: z.string().min(1),
	description: z.string().nullable().optional(),
	type: ScheduleItemTypeSchema.default('otro'),
	defaultDurationMinutes: z.number().int().min(1).default(15),
	defaultOrder: z.number().int().default(0),
	defaultDay: z.number().int().min(1).max(7).default(1),
	defaultStartTime: z
		.string()
		.regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
		.nullable()
		.optional(),
	requiresResponsable: z.boolean().default(false),
	allowedResponsibilityTypes: z.string().nullable().optional(),
	responsabilityName: z.string().nullable().optional(),
	musicTrackUrl: z.string().nullable().optional(),
	palanquitaNotes: z.string().nullable().optional(),
	planBNotes: z.string().nullable().optional(),
	blocksSantisimoAttendance: z.boolean().default(false),
	locationHint: z.string().nullable().optional(),
	isActive: z.boolean().default(true),
	attachments: z.array(ResponsabilityAttachmentSchema).optional(),
	createdAt: z.coerce.date().optional(),
	updatedAt: z.coerce.date().optional(),
});
export type ScheduleTemplate = z.infer<typeof ScheduleTemplateSchema>;

export const CreateScheduleTemplateSchema = z.object({
	body: ScheduleTemplateSchema.omit({ id: true, createdAt: true, updatedAt: true }),
});
export const UpdateScheduleTemplateSchema = z.object({
	body: ScheduleTemplateSchema.omit({ id: true, createdAt: true, updatedAt: true }).partial(),
	params: z.object({ id: idSchema }),
});

// --- Per-retreat instance ---

export const RetreatScheduleItemSchema = z.object({
	id: idSchema,
	retreatId: idSchema,
	scheduleTemplateId: idSchema.nullable().optional(),
	name: z.string().min(1),
	type: ScheduleItemTypeSchema.default('otro'),
	day: z.number().int().min(1).max(7).default(1),
	startTime: z.coerce.date(),
	endTime: z.coerce.date(),
	durationMinutes: z.number().int().min(0).default(15),
	orderInDay: z.number().int().default(0),
	status: ScheduleItemStatusSchema.default('pending'),
	responsabilityId: idSchema.nullable().optional(),
	location: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
	musicTrackUrl: z.string().nullable().optional(),
	palanquitaNotes: z.string().nullable().optional(),
	planBNotes: z.string().nullable().optional(),
	blocksSantisimoAttendance: z.boolean().default(false),
	actualStartTime: z.coerce.date().nullable().optional(),
	actualEndTime: z.coerce.date().nullable().optional(),
	responsables: z
		.array(
			z.object({
				id: idSchema.optional(),
				participantId: idSchema,
				role: z.string().nullable().optional(),
			}),
		)
		.optional(),
	// Heredados del template (read-only desde la perspectiva del retiro).
	attachments: z.array(ResponsabilityAttachmentSchema).optional(),
});
export type RetreatScheduleItem = z.infer<typeof RetreatScheduleItemSchema>;

export const CreateRetreatScheduleItemSchema = z.object({
	body: RetreatScheduleItemSchema.omit({ id: true, retreatId: true }).extend({
		responsableParticipantIds: z.array(idSchema).optional(),
	}),
	params: z.object({ retreatId: idSchema }),
});

export const UpdateRetreatScheduleItemSchema = z.object({
	body: RetreatScheduleItemSchema.omit({ id: true, retreatId: true })
		.partial()
		.extend({
			responsableParticipantIds: z.array(idSchema).optional(),
		}),
	params: z.object({ id: idSchema }),
});

export const MaterializeScheduleSchema = z.object({
	body: z.object({
		baseDate: z.coerce.date(),
		templateSetId: idSchema.optional(),
		clearExisting: z.boolean().default(false).optional(),
	}),
	params: z.object({ retreatId: idSchema }),
});

export const ShiftScheduleSchema = z.object({
	body: z.object({
		minutesDelta: z.number().int(),
		propagate: z.boolean().default(true).optional(),
	}),
	params: z.object({ id: idSchema }),
});

// --- Realtime event payloads ---

export const ScheduleItemStartedPayloadSchema = z.object({
	retreatId: idSchema,
	itemId: idSchema,
	actualStartTime: z.string(),
});
export type ScheduleItemStartedPayload = z.infer<typeof ScheduleItemStartedPayloadSchema>;

export const ScheduleItemCompletedPayloadSchema = z.object({
	retreatId: idSchema,
	itemId: idSchema,
	actualEndTime: z.string(),
});
export type ScheduleItemCompletedPayload = z.infer<typeof ScheduleItemCompletedPayloadSchema>;

export const ScheduleUpcomingPayloadSchema = z.object({
	retreatId: idSchema,
	itemId: idSchema,
	name: z.string(),
	startTime: z.string(),
	minutesUntil: z.number().int(),
	targetParticipantIds: z.array(idSchema),
});
export type ScheduleUpcomingPayload = z.infer<typeof ScheduleUpcomingPayloadSchema>;

export const ScheduleUpdatedPayloadSchema = z.object({
	retreatId: idSchema,
	itemId: idSchema,
});
export type ScheduleUpdatedPayload = z.infer<typeof ScheduleUpdatedPayloadSchema>;

export const ScheduleBellPayloadSchema = z.object({
	retreatId: idSchema,
	message: z.string().optional(),
});
export type ScheduleBellPayload = z.infer<typeof ScheduleBellPayloadSchema>;
