import { z } from 'zod';
import { segmentFiltersSchema } from './segment';

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

export const sequenceAudience = z.enum([
	'walker',
	'server',
	'all',
	'table_leaders',
	// Titulares de cualquier responsabilidad del retiro (palanquero, sacerdotes…).
	'responsables',
]);
export type SequenceAudience = z.infer<typeof sequenceAudience>;

/**
 * A quién va dirigido cada paso: al participante o a uno de sus contactos de
 * emergencia. Cuando es un contacto de emergencia, se usa su teléfono/email y
 * las variables {participant.recipientName} resuelven al nombre del contacto.
 */
export const messageRecipientTarget = z.enum([
	'participant',
	'emergencyContact1',
	'emergencyContact2',
	// El servidor que invitó al participante (resuelto por participant.invitedBy).
	'inviter',
	// El líder/colíder de la mesa del participante enrolado.
	'tableLeader',
	// El titular de una responsabilidad del retiro (nombre en recipientResponsibility).
	'responsibility',
]);
export type MessageRecipientTarget = z.infer<typeof messageRecipientTarget>;

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
	recipientTarget: messageRecipientTarget.default('participant'),
	recipientResponsibility: z.string().nullish(),
	condition: segmentFiltersSchema.nullish(),
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
	maxOverdueDays: z.number().int().min(0).nullish(),
	createdBy: idSchema.nullish(),
	steps: z.array(sequenceStepSchema).optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});
export type MessageSequence = z.infer<typeof messageSequenceSchema>;

// El paso al crear/editar una secuencia. El `id` es opcional: al editar, los
// pasos existentes lo envían para conservar su identidad (y no re-enviar a
// quienes ya recibieron); los pasos nuevos lo omiten.
const stepInputSchema = z.object({
	id: idSchema.optional(),
	stepOrder: z.number().int().min(0).default(0),
	offsetDays: z.number().int().default(0),
	sendHour: z.number().int().min(0).max(23).default(9),
	templateType: z.string().min(1),
	channel: messageChannel,
	recipientTarget: messageRecipientTarget.default('participant'),
	recipientResponsibility: z.string().nullish(),
	condition: segmentFiltersSchema.nullish(),
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
		maxOverdueDays: z.number().int().min(0).nullish(),
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
		maxOverdueDays: z.number().int().min(0).nullish(),
		steps: z.array(stepInputSchema).optional(),
	}),
	params: z.object({ id: idSchema }),
});

export type CreateMessageSequence = z.infer<typeof createMessageSequenceSchema>;
export type UpdateMessageSequence = z.infer<typeof updateMessageSequenceSchema>;
export type SequenceStepInput = z.infer<typeof stepInputSchema>;

// ---------------------------------------------------------------------------
// Plantillas globales de secuencias (reutilizables en cualquier retiro).
// Igual que una secuencia pero SIN retiro y SIN segmentId (los segmentos son
// por-retiro). Se importan a un retiro vía copy-to-retreat (quedan inactivas).
// ---------------------------------------------------------------------------

export const globalSequenceStepSchema = z.object({
	id: idSchema,
	sequenceId: idSchema,
	stepOrder: z.number().int().min(0),
	offsetDays: z.number().int(),
	sendHour: z.number().int().min(0).max(23).default(9),
	templateType: z.string().min(1),
	channel: messageChannel,
	recipientTarget: messageRecipientTarget.default('participant'),
	recipientResponsibility: z.string().nullish(),
	condition: segmentFiltersSchema.nullish(),
	createdAt: z.date(),
	updatedAt: z.date(),
});
export type GlobalSequenceStep = z.infer<typeof globalSequenceStepSchema>;

export const globalMessageSequenceSchema = z.object({
	id: idSchema,
	name: z.string().min(1, 'El nombre es requerido').max(150),
	description: z.string().nullish(),
	trigger: sequenceTrigger,
	audience: sequenceAudience.default('all'),
	isActive: z.boolean().default(true),
	maxOverdueDays: z.number().int().min(0).nullish(),
	steps: z.array(globalSequenceStepSchema).optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});
export type GlobalMessageSequence = z.infer<typeof globalMessageSequenceSchema>;

export const createGlobalMessageSequenceSchema = z.object({
	body: z.object({
		name: z.string().min(1).max(150),
		description: z.string().nullish(),
		trigger: sequenceTrigger,
		audience: sequenceAudience.default('all'),
		isActive: z.boolean().default(true),
		maxOverdueDays: z.number().int().min(0).nullish(),
		steps: z.array(stepInputSchema).default([]),
	}),
});

export const updateGlobalMessageSequenceSchema = z.object({
	body: z.object({
		name: z.string().min(1).max(150).optional(),
		description: z.string().nullish(),
		trigger: sequenceTrigger.optional(),
		audience: sequenceAudience.optional(),
		isActive: z.boolean().optional(),
		maxOverdueDays: z.number().int().min(0).nullish(),
		steps: z.array(stepInputSchema).optional(),
	}),
	params: z.object({ id: idSchema }),
});

export type CreateGlobalMessageSequence = z.infer<typeof createGlobalMessageSequenceSchema>;
export type UpdateGlobalMessageSequence = z.infer<typeof updateGlobalMessageSequenceSchema>;
