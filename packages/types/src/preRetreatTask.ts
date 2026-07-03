import { z } from 'zod';

const idSchema = z.string().uuid();

// Coacciona "" -> null para tolerar `<select>`/inputs vacíos del modal.
const nullableParticipantIdSchema = z.preprocess(
	(v) => (v === '' ? null : v),
	idSchema.nullable().optional(),
);

const dateOnlySchema = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/)
	.nullable()
	.optional();

export const PreRetreatTaskStatusSchema = z.enum([
	'pending',
	'in_progress',
	'done',
	'not_applicable',
]);
export type PreRetreatTaskStatus = z.infer<typeof PreRetreatTaskStatusSchema>;

// --- Template sets ---

export const PreRetreatTaskTemplateSetSchema = z.object({
	id: idSchema,
	name: z.string().min(1).max(120),
	description: z.string().nullable().optional(),
	sourceTag: z.string().nullable().optional(),
	isActive: z.boolean().default(true),
	isDefault: z.boolean().default(false),
	createdAt: z.coerce.date().optional(),
	updatedAt: z.coerce.date().optional(),
});
export type PreRetreatTaskTemplateSetDTO = z.infer<typeof PreRetreatTaskTemplateSetSchema>;

export const CreatePreRetreatTaskTemplateSetSchema = z.object({
	body: PreRetreatTaskTemplateSetSchema.omit({ id: true, createdAt: true, updatedAt: true }),
});
export const UpdatePreRetreatTaskTemplateSetSchema = z.object({
	body: PreRetreatTaskTemplateSetSchema.omit({
		id: true,
		createdAt: true,
		updatedAt: true,
	}).partial(),
	params: z.object({ id: idSchema }),
});

// --- Global template (tarea o sub-tarea vía parentId) ---

const preRetreatTaskTemplateBase = z.object({
	id: idSchema,
	templateSetId: idSchema.nullable().optional(),
	parentId: idSchema.nullable().optional(),
	name: z.string().min(1),
	description: z.string().nullable().optional(),
	// Días antes del startDate del retiro. Requerido en raíces (lo valida el
	// servicio); null en hijos = hereda el offset del padre al materializar.
	dueOffsetDays: z.number().int().min(0).nullable().optional(),
	defaultOrder: z.number().int().default(0),
	supportNotes: z.string().nullable().optional(),
	isActive: z.boolean().default(true),
	createdAt: z.coerce.date().optional(),
	updatedAt: z.coerce.date().optional(),
});

// `children` es derivado (árbol armado al listar) — read-only. La jerarquía es
// de máximo 2 niveles, así que los hijos son el schema base (sin children).
export const PreRetreatTaskTemplateSchema = preRetreatTaskTemplateBase.extend({
	children: z.array(preRetreatTaskTemplateBase).optional(),
});
export type PreRetreatTaskTemplateDTO = z.infer<typeof PreRetreatTaskTemplateSchema>;

export const CreatePreRetreatTaskTemplateSchema = z.object({
	body: preRetreatTaskTemplateBase.omit({ id: true, createdAt: true, updatedAt: true }),
});
export const UpdatePreRetreatTaskTemplateSchema = z.object({
	body: preRetreatTaskTemplateBase.omit({ id: true, createdAt: true, updatedAt: true }).partial(),
	params: z.object({ id: idSchema }),
});

// --- Per-retreat instance ---

const retreatPreRetreatTaskBase = z.object({
	id: idSchema,
	retreatId: idSchema,
	templateId: idSchema.nullable().optional(),
	parentId: idSchema.nullable().optional(),
	name: z.string().min(1),
	description: z.string().nullable().optional(),
	dueOffsetDays: z.number().int().min(0).nullable().optional(),
	// Date-only `YYYY-MM-DD` — NUNCA z.coerce.date(): la columna es 'date' y un
	// Date con TZ local haría saltar la fecha un día (lección timezone-handling).
	dueDate: dateOnlySchema,
	status: PreRetreatTaskStatusSchema.default('pending'),
	responsibleParticipantId: nullableParticipantIdSchema,
	responsibleText: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
	supportNotes: z.string().nullable().optional(),
	sortOrder: z.number().int().default(0),
});

// Campos derivados de LECTURA: `responsible` (JOIN a participants), `progress`
// (agregado), `completedAt` (lo maneja setStatus) y timestamps.
const retreatTaskReadExtras = {
	responsible: z
		.object({
			id: z.string(),
			firstName: z.string().nullable().optional(),
			lastName: z.string().nullable().optional(),
			nickname: z.string().nullable().optional(),
		})
		.nullable()
		.optional(),
	progress: z.object({ done: z.number().int(), total: z.number().int() }).optional(),
	completedAt: z.coerce.date().nullable().optional(),
	createdAt: z.coerce.date().optional(),
	updatedAt: z.coerce.date().optional(),
};

const retreatTaskChildSchema = retreatPreRetreatTaskBase.extend(retreatTaskReadExtras);

// DTO de LECTURA. Jerarquía de máximo 2 niveles: las raíces llevan `children`
// (hijos sin anidamiento adicional).
export const RetreatPreRetreatTaskSchema = retreatTaskChildSchema.extend({
	children: z.array(retreatTaskChildSchema).optional(),
});
export type RetreatPreRetreatTaskDTO = z.infer<typeof RetreatPreRetreatTaskSchema>;

// Los write schemas parten del base (sin los campos derivados) para que un
// cliente que reenvíe el DTO de lectura completo NO falle validación: los
// derivados simplemente se descartan (regla del proyecto; ver guard test).
export const CreateRetreatPreRetreatTaskSchema = z.object({
	body: retreatPreRetreatTaskBase.omit({ id: true, retreatId: true }),
	params: z.object({ retreatId: idSchema }),
});

export const UpdateRetreatPreRetreatTaskSchema = z.object({
	body: retreatPreRetreatTaskBase.omit({ id: true, retreatId: true }).partial(),
	params: z.object({ id: idSchema }),
});

export const SetPreRetreatTaskStatusSchema = z.object({
	body: z.object({ status: PreRetreatTaskStatusSchema }),
	params: z.object({ id: idSchema }),
});

export const MaterializePreRetreatTasksSchema = z.object({
	body: z.object({
		templateSetId: idSchema.optional(),
		clearExisting: z.boolean().default(false).optional(),
		// Opcional: por defecto el server usa retreat.startDate.
		baseDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional(),
	}),
	params: z.object({ retreatId: idSchema }),
});
