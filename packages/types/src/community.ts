import { z } from 'zod';

// Member state enum
export const MemberStateEnum = z.enum([
	'far_from_location', // Se mudó o tiene problemas de ubicación
	'no_answer', // No responde a comunicaciones
	'another_group', // Se unió a otro grupo
	'active_member', // Miembro activo
	'pending_verification', // Pendiente de verificación por administrador
]);
export type MemberState = z.infer<typeof MemberStateEnum>;

// Recurrence frequency enum for meetings
export const RecurrenceFrequencyEnum = z.enum(['daily', 'weekly', 'monthly']);
export type RecurrenceFrequency = z.infer<typeof RecurrenceFrequencyEnum>;

// Participation frequency enum (calculated)
export const ParticipationFrequencyEnum = z.enum([
	'high', // ≥75% attendance
	'medium', // 25-74%
	'low', // 1-24%
	'none', // 0%
]);
export type ParticipationFrequency = z.infer<typeof ParticipationFrequencyEnum>;

// Community status enum
export const CommunityStatusEnum = z.enum(['pending', 'active', 'rejected']);
export type CommunityStatus = z.infer<typeof CommunityStatusEnum>;

// Community schema
export const communitySchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(200),
	description: z.string().optional(),
	address1: z.string().min(1),
	address2: z.string().optional(),
	city: z.string().min(1),
	state: z.string().min(1),
	zipCode: z.string().min(1),
	country: z.string().min(1),
	latitude: z.number().optional(),
	longitude: z.number().optional(),
	googleMapsUrl: z.string().optional(),
	createdBy: z.string().uuid().nullable().optional(),
	status: CommunityStatusEnum.default('active'),
	parish: z.string().optional().nullable(),
	diocese: z.string().optional().nullable(),
	website: z.string().optional().nullable(),
	facebookUrl: z.string().optional().nullable(),
	instagramUrl: z.string().optional().nullable(),
	contactName: z.string().optional().nullable(),
	contactEmail: z.string().optional().nullable(),
	contactPhone: z.string().optional().nullable(),
	submittedAt: z.coerce.date().optional().nullable(),
	approvedAt: z.coerce.date().optional().nullable(),
	approvedBy: z.string().uuid().optional().nullable(),
	rejectionReason: z.string().optional().nullable(),
	defaultMeetingDayOfWeek: z.string().optional().nullable(),
	defaultMeetingInterval: z.number().int().positive().optional().nullable(),
	defaultMeetingTime: z.string().optional().nullable(),
	defaultMeetingDurationMinutes: z.number().int().positive().optional().nullable(),
	defaultMeetingDescription: z.string().optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	// Calculated fields
	memberCount: z.number().optional(),
	meetingCount: z.number().optional(),
	stats: z.any().optional(),
});
export type Community = z.infer<typeof communitySchema>;

export const DayOfWeekEnum = z.enum([
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday',
	'sunday',
]);
export type DayOfWeek = z.infer<typeof DayOfWeekEnum>;

// CommunityMember schema
export const communityMemberSchema = z.object({
	id: z.string().uuid(),
	communityId: z.string().uuid(),
	participantId: z.string().uuid(),
	state: MemberStateEnum.default('active_member'),
	joinedAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	notes: z.string().nullable().optional(),
	// Join relations (not always present)
	participant: z.any().optional(),
	// Calculated fields
	lastMeetingsAttendanceRate: z.number().optional(),
	lastMeetingsFrequency: ParticipationFrequencyEnum.optional(),
});
export type CommunityMember = z.infer<typeof communityMemberSchema>;

// CommunityMeeting schema
export const communityMeetingSchema = z.object({
	id: z.string().uuid(),
	communityId: z.string().uuid(),
	title: z.string().min(1).max(200),
	description: z.string().optional(),
	flyerTemplate: z.string().optional(),
	startDate: z.coerce.date(),
	endDate: z.coerce.date().optional(),
	durationMinutes: z.number().int().positive(),
	isAnnouncement: z.boolean().default(false),
	// Recurrence fields
	recurrenceFrequency: RecurrenceFrequencyEnum.nullable(),
	recurrenceInterval: z.number().int().positive().nullable(),
	recurrenceDayOfWeek: z.string().nullable(),
	recurrenceDayOfMonth: z.number().int().positive().max(31).nullable(),
	isRecurrenceTemplate: z.boolean().default(false),
	parentMeetingId: z.string().uuid().nullable(),
	instanceDate: z.coerce.date().nullable(),
	exceptionType: z.enum(['modified', 'cancelled']).nullable(),
	createdAt: z.coerce.date(),
});
export type CommunityMeeting = z.infer<typeof communityMeetingSchema>;

// CommunityAdmin schema
export const communityAdminSchema = z.object({
	id: z.string().uuid(),
	communityId: z.string().uuid(),
	userId: z.string().uuid(),
	role: z.enum(['owner', 'admin']),
	invitedBy: z.string().uuid().optional(),
	invitedAt: z.coerce.date().optional(),
	acceptedAt: z.coerce.date().optional(),
	status: z.enum(['pending', 'active', 'revoked']).default('pending'),
	invitationToken: z.string().optional(),
	invitationExpiresAt: z.coerce.date().optional(),
	// Join relations
	user: z.any().optional(),
	inviter: z.any().optional(),
});
export type CommunityAdmin = z.infer<typeof communityAdminSchema>;

// CommunityAttendance schema
export const communityAttendanceSchema = z.object({
	id: z.string().uuid(),
	meetingId: z.string().uuid(),
	memberId: z.string().uuid(),
	attended: z.boolean(),
	notes: z.string().optional(),
	recordedAt: z.coerce.date(),
});
export type CommunityAttendance = z.infer<typeof communityAttendanceSchema>;

// --- API Request Schemas ---

export const createCommunitySchema = z.object({
	body: communitySchema.omit({
		id: true,
		createdBy: true,
		createdAt: true,
		updatedAt: true,
	}),
});

export const updateCommunitySchema = z.object({
	body: communitySchema
		.omit({
			id: true,
			createdBy: true,
			createdAt: true,
			updatedAt: true,
		})
		.partial(),
	params: z.object({ id: z.string().uuid() }),
});

export const createCommunityMeetingSchema = z.object({
	body: z.object({
		title: z.string().min(1).max(200),
		description: z.string().optional(),
		flyerTemplate: z.string().optional(),
		startDate: z.coerce.date(),
		endDate: z.coerce.date().optional(),
		durationMinutes: z.number().int().positive().optional(),
		isAnnouncement: z.boolean().default(false),
		// Recurrence fields - use optional() to allow undefined, nullable() to allow null
		recurrenceFrequency: RecurrenceFrequencyEnum.optional(),
		recurrenceInterval: z.number().int().positive().optional(),
		recurrenceDayOfWeek: z.string().optional(),
		recurrenceDayOfMonth: z.number().int().positive().max(31).nullable().optional(),
	}),
	params: z.object({
		id: z.string().uuid(),
	}),
});

export const updateCommunityMeetingSchema = z.object({
	body: communityMeetingSchema
		.omit({
			id: true,
			communityId: true,
			createdAt: true,
		})
		.partial(),
	params: z.object({ id: z.string().uuid() }),
});

export const importMembersSchema = z.object({
	body: z.object({
		retreatId: z.string().uuid(),
		participantIds: z.array(z.string().uuid()),
	}),
});

export const updateMemberStateSchema = z.object({
	body: z.object({
		state: MemberStateEnum,
	}),
	params: z.object({
		id: z.string().uuid(),
		memberId: z.string().uuid(),
	}),
});

export const recordAttendanceSchema = z.object({
	body: z.array(
		z.object({
			memberId: z.string().uuid(),
			attended: z.boolean(),
			notes: z.string().optional(),
		}),
	),
});

export const inviteCommunityAdminSchema = z.object({
	body: z.object({
		email: z.string().email(),
	}),
});

export const publicJoinRequestSchema = z.object({
	body: z.object({
		firstName: z.string().min(1),
		lastName: z.string().min(1),
		email: z.string().email(),
		cellPhone: z.string().optional(),
	}),
	params: z.object({
		id: z.string().uuid(),
	}),
});

const optionalUrl = z
	.string()
	.trim()
	.url()
	.optional()
	.or(z.literal('').transform(() => undefined));

export const publicRegisterCommunitySchema = z.object({
	body: z.object({
		name: z.string().trim().min(1).max(200),
		description: z.string().trim().max(2000).optional(),
		address1: z.string().trim().min(1).max(255),
		address2: z.string().trim().max(255).optional(),
		city: z.string().trim().min(1).max(255),
		state: z.string().trim().min(1).max(255),
		zipCode: z.string().trim().min(1).max(20),
		country: z.string().trim().min(1).max(255),
		latitude: z.number().min(-90).max(90),
		longitude: z.number().min(-180).max(180),
		googleMapsUrl: optionalUrl,
		parish: z.string().trim().max(255).optional(),
		diocese: z.string().trim().max(255).optional(),
		website: optionalUrl,
		facebookUrl: optionalUrl,
		instagramUrl: optionalUrl,
		contactName: z.string().trim().min(1).max(255),
		contactEmail: z.string().trim().toLowerCase().email(),
		contactPhone: z.string().trim().max(50).optional(),
		// Horario por defecto (opcional). Si se llenan, al aprobar se crea una reunión recurrente.
		defaultMeetingDayOfWeek: DayOfWeekEnum.optional(),
		defaultMeetingInterval: z.number().int().min(1).max(12).optional(),
		defaultMeetingTime: z
			.string()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (formato HH:mm)')
			.optional(),
		defaultMeetingDurationMinutes: z.number().int().min(15).max(600).optional(),
		defaultMeetingDescription: z.string().trim().max(1000).optional(),
		recaptchaToken: z.string().min(1),
	}),
});
export type PublicRegisterCommunityInput = z.infer<
	typeof publicRegisterCommunitySchema
>['body'];

export const approveCommunitySchema = z.object({
	params: z.object({ id: z.string().uuid() }),
});

export const rejectCommunitySchema = z.object({
	params: z.object({ id: z.string().uuid() }),
	body: z.object({
		rejectionReason: z.string().trim().max(2000).optional(),
	}),
});
