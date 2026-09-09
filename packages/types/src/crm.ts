import { z } from 'zod';

const idSchema = z.string().uuid();

export const followUpStatus = z.enum(['pending', 'contacted', 'confirmed', 'no_answer', 'declined']);
export type FollowUpStatus = z.infer<typeof followUpStatus>;

export const crmTaskStatus = z.enum(['open', 'done']);
export type CrmTaskStatus = z.infer<typeof crmTaskStatus>;

export const participantFollowUpSchema = z.object({
	id: idSchema,
	retreatId: idSchema,
	participantId: idSchema,
	status: followUpStatus,
	note: z.string().nullish(),
	updatedBy: idSchema.nullish(),
	createdAt: z.date(),
	updatedAt: z.date(),
});
export type ParticipantFollowUp = z.infer<typeof participantFollowUpSchema>;

export const upsertFollowUpSchema = z.object({
	body: z.object({
		retreatId: idSchema,
		participantId: idSchema,
		status: followUpStatus,
		note: z.string().nullish(),
	}),
});
export type UpsertFollowUp = z.infer<typeof upsertFollowUpSchema>;

export const crmTaskSchema = z.object({
	id: idSchema,
	retreatId: idSchema,
	participantId: idSchema.nullish(),
	title: z.string().min(1).max(200),
	description: z.string().nullish(),
	dueDate: z.union([z.string(), z.date()]).nullish(),
	status: crmTaskStatus,
	assignedTo: idSchema.nullish(),
	completedAt: z.union([z.string(), z.date()]).nullish(),
	createdAt: z.date(),
	updatedAt: z.date(),
});
export type CrmTask = z.infer<typeof crmTaskSchema>;

export const createCrmTaskSchema = z.object({
	body: z.object({
		retreatId: idSchema,
		participantId: idSchema.nullish(),
		title: z.string().min(1).max(200),
		description: z.string().nullish(),
		dueDate: z.string().nullish(),
		assignedTo: idSchema.nullish(),
	}),
});

export const updateCrmTaskSchema = z.object({
	body: z.object({
		title: z.string().min(1).max(200).optional(),
		description: z.string().nullish(),
		dueDate: z.string().nullish(),
		status: crmTaskStatus.optional(),
		assignedTo: idSchema.nullish(),
	}),
	params: z.object({ id: idSchema }),
});

export type CreateCrmTask = z.infer<typeof createCrmTaskSchema>;
export type UpdateCrmTask = z.infer<typeof updateCrmTaskSchema>;

// ---------------------------------------------------------------------------
// Hilo de notas / actividad por persona
// ---------------------------------------------------------------------------

export const participantNoteKind = z.enum(['note', 'stage_change']);
export type ParticipantNoteKind = z.infer<typeof participantNoteKind>;

export const participantNoteScope = z.enum(['retreat', 'community']);

/** Metadata de las entradas del sistema (`kind = 'stage_change'`). */
export const participantNoteMetadataSchema = z.object({
	from: z.string().optional(),
	to: z.string().optional(),
	attendanceSynced: z.boolean().optional(),
	milestone: z.literal('palancas').optional(),
	count: z.number().optional(),
	threshold: z.number().optional(),
});
export type ParticipantNoteMetadata = z.infer<typeof participantNoteMetadataSchema>;

export const participantNoteSchema = z.object({
	id: idSchema,
	participantId: idSchema,
	scope: participantNoteScope,
	retreatId: idSchema.nullish(),
	communityId: idSchema.nullish(),
	kind: participantNoteKind,
	body: z.string().nullish(),
	metadata: participantNoteMetadataSchema.nullish(),
	createdBy: idSchema.nullish(),
	createdAt: z.union([z.string(), z.date()]),
	updatedAt: z.union([z.string(), z.date()]),
});
export type ParticipantNote = z.infer<typeof participantNoteSchema>;

// Sólo se crean notas escritas por una persona; las `stage_change` las
// escribe el servicio, nunca el cliente.
export const createParticipantNoteSchema = z.object({
	body: z.object({
		retreatId: idSchema,
		participantId: idSchema,
		body: z.string().trim().min(1).max(5000),
	}),
});
export type CreateParticipantNote = z.infer<typeof createParticipantNoteSchema>;

export const updateParticipantNoteSchema = z.object({
	body: z.object({
		body: z.string().trim().min(1).max(5000),
	}),
	params: z.object({ id: idSchema }),
});
export type UpdateParticipantNote = z.infer<typeof updateParticipantNoteSchema>;

// ---------------------------------------------------------------------------
// Timeline unificado
// ---------------------------------------------------------------------------

export const timelineEventType = z.enum([
	'note',
	'stage_change',
	'message',
	'message_scheduled',
	'task',
	'registered',
	'attendance',
	'payment',
	'palancas',
]);
export type TimelineEventType = z.infer<typeof timelineEventType>;

/**
 * `contactKey` dice a QUIÉN se le habló (el caminante, un familiar, el
 * invitador). Es lo que permite filtrar el hilo por interlocutor.
 */
export const timelineEventSchema = z.object({
	id: z.string(),
	type: timelineEventType,
	at: z.union([z.string(), z.date()]).nullable(),
	title: z.string(),
	detail: z.string().nullish(),
	contactKey: z.string().nullish(),
	contactName: z.string().nullish(),
	actorName: z.string().nullish(),
	meta: z.record(z.unknown()).nullish(),
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
