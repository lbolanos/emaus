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
