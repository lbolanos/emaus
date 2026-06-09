import { z } from 'zod';

const idSchema = z.string().uuid();

// Id de una Responsabilidad del retiro. Acepta uuid (uuidv4, creadas por el
// servicio) y hex de 32 chars sin guiones (las creadas por migraciones batch con
// `hex(randomblob(16))`: roles fijos, charlas, textos). Coacciona "" -> null para
// tolerar el `<select>` del modal de edición. La existencia la garantiza el FK a
// retreat_responsibilities, así que no hace falta validar más estricto.
const responsabilityIdSchema = z.preprocess(
	(v) => (v === '' ? null : v),
	z
		.union([z.string().uuid(), z.string().regex(/^[0-9a-f]{32}$/i)])
		.nullable()
		.optional(),
);

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

// `attachments` es read-only (se gestiona por nombre canónico vía los endpoints
// de responsability-attachments); se omite del body de create/update para que el
// servidor lo descarte y no falle la validación si el cliente lo envía.
export const CreateScheduleTemplateSchema = z.object({
	body: ScheduleTemplateSchema.omit({
		id: true,
		createdAt: true,
		updatedAt: true,
		attachments: true,
	}),
});
export const UpdateScheduleTemplateSchema = z.object({
	body: ScheduleTemplateSchema.omit({
		id: true,
		createdAt: true,
		updatedAt: true,
		attachments: true,
	}).partial(),
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
	responsabilityId: responsabilityIdSchema,
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
	// Descripción de la actividad copiada del schedule_template via JOIN al
	// listar. Read-only desde el retiro — para editarla hay que ir al template
	// global. Útil para mostrar al coordinador el "qué/por qué" de la actividad.
	templateDescription: z.string().nullable().optional(),
});
export type RetreatScheduleItem = z.infer<typeof RetreatScheduleItemSchema>;

// Campos read-only/derivados que NO se escriben por estos endpoints y por tanto
// se omiten del body: `attachments` y `templateDescription` se heredan del
// template (JOIN al listar); `responsables` es la forma de LECTURA — para escribir
// se usa `responsableParticipantIds`. Omitirlos evita 400 si un cliente reenvía el
// DTO de lectura completo (ver "Lecciones aprendidas" en docs/features/minuto-a-minuto.md).
const RETREAT_ITEM_READONLY = {
	attachments: true,
	templateDescription: true,
	responsables: true,
} as const;

export const CreateRetreatScheduleItemSchema = z.object({
	body: RetreatScheduleItemSchema.omit({
		id: true,
		retreatId: true,
		...RETREAT_ITEM_READONLY,
	}).extend({
		// El servicio calcula endTime desde startTime + durationMinutes cuando no
		// se envía, así que el cliente solo manda startTime/durationMinutes.
		endTime: z.coerce.date().optional(),
		responsableParticipantIds: z.array(idSchema).optional(),
	}),
	params: z.object({ retreatId: idSchema }),
});

export const UpdateRetreatScheduleItemSchema = z.object({
	body: RetreatScheduleItemSchema.omit({
		id: true,
		retreatId: true,
		...RETREAT_ITEM_READONLY,
	})
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

export const ShiftDaySchema = z.object({
	body: z.object({
		minutesDelta: z.number().int(),
	}),
	params: z.object({
		retreatId: idSchema,
		day: z.coerce.number().int().min(1).max(7),
	}),
});

export const ReorderDaySchema = z.object({
	body: z.object({
		itemIds: z.array(idSchema).min(1),
	}),
	params: z.object({
		retreatId: idSchema,
		day: z.coerce.number().int().min(1).max(7),
	}),
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
