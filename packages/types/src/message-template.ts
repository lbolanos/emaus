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
	'PALANQUERO_NEW_WALKER',
	'PRIVACY_DATA_DELETE',
	// Walker follow-up sequence (post-retreat)
	'WALKER_FOLLOWUP_WEEK_1',
	'WALKER_FOLLOWUP_MONTH_1',
	'WALKER_FOLLOWUP_MONTH_3',
	'WALKER_FOLLOWUP_MONTH_6',
	'WALKER_FOLLOWUP_YEAR_1',
	'WALKER_REUNION_INVITATION',
	// Briefing de mesa para líderes/colíderes (roster + teléfonos + guion)
	'TABLE_LEADER_BRIEFING',
	// Confirmación de asistencia que el líder envía a cada caminante (con datos del retiro)
	'WALKER_CONFIRMATION',
	// Family invitation to closing mass
	'FAMILY_CLOSING_INVITATION_WHATSAPP',
	'FAMILY_CLOSING_INVITATION_EMAIL',
	// Community lifecycle notifications (consumed by communityService.renderTemplate)
	'COMMUNITY_MEETING_INVITATION',
	'COMMUNITY_MEMBER_APPROVED',
	'COMMUNITY_JOIN_REQUEST_ADMIN',
	'COMMUNITY_LINK_REQUEST_CONFIRM',
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

/**
 * Audiencia a la que va dirigida una plantilla, para clasificarla/filtrarla en
 * el selector de mensajes y en el admin de plantillas. Se DERIVA del `type`
 * (no se persiste): caminante, servidor, familiar (contacto de emergencia) o
 * general.
 */
export const messageTemplateAudiences = z.enum([
	'walker',
	'server',
	// Aplica a cualquier participante (caminante Y servidor): pago, cancelación,
	// cumpleaños, validación de contacto, recordatorio pre-retiro, etc.
	'participant',
	'family',
	'general',
	// Líder/colíder de mesa (briefing de mesa).
	'table_leader',
	// Responsable del retiro (palanquero, sacerdotes, coordinadores, etc.).
	'responsible',
]);
export type MessageTemplateAudience = z.infer<typeof messageTemplateAudiences>;

const MESSAGE_TEMPLATE_AUDIENCE_BY_TYPE: Record<string, MessageTemplateAudience> = {
	// Caminante
	WALKER_WELCOME: 'walker',
	WALKER_FOLLOWUP_WEEK_1: 'walker',
	WALKER_FOLLOWUP_MONTH_1: 'walker',
	WALKER_FOLLOWUP_MONTH_3: 'walker',
	WALKER_FOLLOWUP_MONTH_6: 'walker',
	WALKER_FOLLOWUP_YEAR_1: 'walker',
	WALKER_REUNION_INVITATION: 'walker',
	WALKER_CONFIRMATION: 'walker',
	POST_RETREAT_MESSAGE: 'walker',
	// Aplican a cualquier participante (caminante y servidor).
	PRE_RETREAT_REMINDER: 'participant',
	PAYMENT_REMINDER: 'participant',
	CANCELLATION_CONFIRMATION: 'participant',
	BIRTHDAY_MESSAGE: 'participant',
	EMERGENCY_CONTACT_VALIDATION: 'participant',
	// Servidor
	SERVER_WELCOME: 'server',
	// Líder/colíder de mesa
	TABLE_LEADER_BRIEFING: 'table_leader',
	// Responsable (palanquero recibe el aviso de nuevo caminante)
	PALANQUERO_NEW_WALKER: 'responsible',
	// Familiar (palanquero/familia/contacto de emergencia): la palanca se le pide a
	// un familiar o amigo del caminante; la invitación de clausura va a la familia.
	PALANCA_REQUEST: 'family',
	PALANCA_REMINDER: 'family',
	FAMILY_CLOSING_INVITATION_WHATSAPP: 'family',
	FAMILY_CLOSING_INVITATION_EMAIL: 'family',
	// El resto (GENERAL, PRIVACY_DATA_DELETE, COMMUNITY_*, SYS_*, etc.) → general.
};

/**
 * Devuelve la audiencia de una plantilla a partir de su `type`. Default 'general'.
 */
export function getMessageTemplateAudience(type: string): MessageTemplateAudience {
	return MESSAGE_TEMPLATE_AUDIENCE_BY_TYPE[type] ?? 'general';
}

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
