import { z } from 'zod';

const idSchema = z.string().uuid();

export const messageTemplateTypes = z.enum([
	'WALKER_WELCOME',
	'SERVER_WELCOME',
	'EMERGENCY_CONTACT_VALIDATION',
	'PALANCA_REQUEST',
	'PALANCA_REMINDER',
	'GENERAL',
	'PRE_RETREAT_REMINDER',
	'PAYMENT_REMINDER',
	'POST_RETREAT_MESSAGE',
	'CANCELLATION_CONFIRMATION',
	'USER_INVITATION',
	'PASSWORD_RESET',
	'RETREAT_SHARED_NOTIFICATION',
	'BIRTHDAY_MESSAGE',
]);

export const MessageTemplateSchema = z.object({
	id: idSchema,
	name: z.string().min(1, 'Name is required'),
	type: messageTemplateTypes,
	message: z.string().min(1, 'Message is required'),
	retreatId: idSchema,
	createdAt: z.date(),
	updatedAt: z.date(),
});

export const CreateMessageTemplateSchema = z.object({
	body: MessageTemplateSchema.omit({
		id: true,
		createdAt: true,
		updatedAt: true,
	}),
});

export const UpdateMessageTemplateSchema = z.object({
	body: CreateMessageTemplateSchema.shape.body.partial(),
	params: z.object({
		id: z.string().uuid(),
	}),
});

export type MessageTemplate = z.infer<typeof MessageTemplateSchema>;
export type CreateMessageTemplate = z.infer<typeof CreateMessageTemplateSchema>;
export type UpdateMessageTemplate = z.infer<typeof UpdateMessageTemplateSchema>;
