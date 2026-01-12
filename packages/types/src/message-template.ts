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
	// System-wide templates with SYS_ prefix
	'SYS_PASSWORD_RESET',
	'SYS_USER_INVITATION',
	'SYS_REGISTRATION_CONFIRMATION',
	'SYS_EMAIL_VERIFICATION',
	'SYS_ACCOUNT_LOCKED',
	'SYS_ACCOUNT_UNLOCKED',
	'SYS_ROLE_REQUESTED',
	'SYS_ROLE_APPROVED',
	'SYS_ROLE_REJECTED',
]);

export const messageTemplateScope = z.enum(['retreat', 'community']);

export const MessageTemplateSchema = z.object({
	id: idSchema,
	name: z.string().min(1, 'Name is required'),
	type: messageTemplateTypes,
	scope: messageTemplateScope.default('retreat'),
	message: z.string().min(1, 'Message is required'),
	retreatId: idSchema.optional(),
	communityId: idSchema.optional(),
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

export const GlobalMessageTemplateSchema = z.object({
	id: idSchema,
	name: z.string().min(1, 'Name is required'),
	type: messageTemplateTypes,
	message: z.string().min(1, 'Message is required'),
	isActive: z.boolean().default(true),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export const CreateGlobalMessageTemplateSchema = z.object({
	body: GlobalMessageTemplateSchema.omit({
		id: true,
		createdAt: true,
		updatedAt: true,
	}),
});

export const UpdateGlobalMessageTemplateSchema = z.object({
	body: CreateGlobalMessageTemplateSchema.shape.body.partial(),
	params: z.object({
		id: z.string().uuid(),
	}),
});

export const ImportTemplateToCommunitySchema = z.object({
	body: z.object({
		communityId: z.string().uuid(),
	}),
});

export type MessageTemplate = z.infer<typeof MessageTemplateSchema>;
export type MessageTemplateScope = z.infer<typeof messageTemplateScope>;
export type CreateMessageTemplate = z.infer<typeof CreateMessageTemplateSchema>;
export type UpdateMessageTemplate = z.infer<typeof UpdateMessageTemplateSchema>;
export type GlobalMessageTemplate = z.infer<typeof GlobalMessageTemplateSchema>;
export type CreateGlobalMessageTemplate = z.infer<typeof CreateGlobalMessageTemplateSchema>;
export type UpdateGlobalMessageTemplate = z.infer<typeof UpdateGlobalMessageTemplateSchema>;
export type ImportTemplateToCommunity = z.infer<typeof ImportTemplateToCommunitySchema>;
