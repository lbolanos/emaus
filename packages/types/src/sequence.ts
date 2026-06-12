import { z } from 'zod';

const idSchema = z.string().uuid();

export const sequenceTrigger = z.enum([
	'participant_created',
	'days_before_retreat',
	'days_after_retreat',
	'birthday',
]);
export type SequenceTrigger = z.infer<typeof sequenceTrigger>;

export const messageChannel = z.enum(['email', 'whatsapp']);
export type MessageChannel = z.infer<typeof messageChannel>;

export const sequenceAudience = z.enum(['walker', 'server', 'all']);
export type SequenceAudience = z.infer<typeof sequenceAudience>;

export const scheduledMessageStatus = z.enum([
	'pending',
	'sent',
	'queued',
	'skipped',
	'failed',
	'cancelled',
]);
export type ScheduledMessageStatus = z.infer<typeof scheduledMessageStatus>;

export const sequenceStepSchema = z.object({
	id: idSchema,
	sequenceId: idSchema,
	stepOrder: z.number().int().min(0),
	offsetDays: z.number().int(),
	sendHour: z.number().int().min(0).max(23).default(9),
	templateType: z.string().min(1),
	channel: messageChannel,
	createdAt: z.date(),
	updatedAt: z.date(),
});
export type SequenceStep = z.infer<typeof sequenceStepSchema>;

export const messageSequenceSchema = z.object({
	id: idSchema,
	name: z.string().min(1, 'El nombre es requerido').max(150),
	description: z.string().nullish(),
	retreatId: idSchema,
	trigger: sequenceTrigger,
	audience: sequenceAudience.default('all'),
	segmentId: idSchema.nullish(),
	isActive: z.boolean().default(true),
	createdBy: idSchema.nullish(),
	steps: z.array(sequenceStepSchema).optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});
export type MessageSequence = z.infer<typeof messageSequenceSchema>;

// El paso al crear/editar una secuencia: sin ids/timestamps.
const stepInputSchema = z.object({
	stepOrder: z.number().int().min(0).default(0),
	offsetDays: z.number().int().default(0),
	sendHour: z.number().int().min(0).max(23).default(9),
	templateType: z.string().min(1),
	channel: messageChannel,
});

export const createMessageSequenceSchema = z.object({
	body: z.object({
		name: z.string().min(1).max(150),
		description: z.string().nullish(),
		retreatId: idSchema,
		trigger: sequenceTrigger,
		audience: sequenceAudience.default('all'),
		segmentId: idSchema.nullish(),
		isActive: z.boolean().default(true),
		steps: z.array(stepInputSchema).default([]),
	}),
});

export const updateMessageSequenceSchema = z.object({
	body: z.object({
		name: z.string().min(1).max(150).optional(),
		description: z.string().nullish(),
		trigger: sequenceTrigger.optional(),
		audience: sequenceAudience.optional(),
		segmentId: idSchema.nullish(),
		isActive: z.boolean().optional(),
		steps: z.array(stepInputSchema).optional(),
	}),
	params: z.object({ id: idSchema }),
});

export type CreateMessageSequence = z.infer<typeof createMessageSequenceSchema>;
export type UpdateMessageSequence = z.infer<typeof updateMessageSequenceSchema>;
export type SequenceStepInput = z.infer<typeof stepInputSchema>;
