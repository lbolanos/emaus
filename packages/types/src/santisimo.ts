import { z } from 'zod';

const idSchema = z.string().uuid();

export const SantisimoSlotSchema = z.object({
	id: idSchema,
	retreatId: idSchema,
	startTime: z.coerce.date(),
	endTime: z.coerce.date(),
	capacity: z.number().int().min(0).default(1),
	isDisabled: z.boolean().default(false),
	intention: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});
export type SantisimoSlot = z.infer<typeof SantisimoSlotSchema>;

export const SantisimoSignupSchema = z.object({
	id: idSchema,
	slotId: idSchema,
	name: z.string().min(1, 'Name is required').max(120),
	phone: z.string().max(40).nullable().optional(),
	email: z.string().email().nullable().optional().or(z.literal('')),
	userId: idSchema.nullable().optional(),
	cancelToken: z.string().nullable().optional(),
	createdAt: z.coerce.date(),
});
export type SantisimoSignup = z.infer<typeof SantisimoSignupSchema>;

// -- Admin request schemas --
export const CreateSantisimoSlotSchema = z.object({
	body: z.object({
		startTime: z.coerce.date(),
		endTime: z.coerce.date(),
		capacity: z.number().int().min(0).default(1).optional(),
		isDisabled: z.boolean().optional(),
		intention: z.string().nullable().optional(),
		notes: z.string().nullable().optional(),
	}),
	params: z.object({ retreatId: idSchema }),
});
export type CreateSantisimoSlot = z.infer<typeof CreateSantisimoSlotSchema>;

export const UpdateSantisimoSlotSchema = z.object({
	body: z.object({
		startTime: z.coerce.date().optional(),
		endTime: z.coerce.date().optional(),
		capacity: z.number().int().min(0).optional(),
		isDisabled: z.boolean().optional(),
		intention: z.string().nullable().optional(),
		notes: z.string().nullable().optional(),
	}),
	params: z.object({ id: idSchema }),
});
export type UpdateSantisimoSlot = z.infer<typeof UpdateSantisimoSlotSchema>;

export const GenerateSantisimoSlotsSchema = z.object({
	body: z.object({
		startDateTime: z.coerce.date(),
		endDateTime: z.coerce.date(),
		slotMinutes: z.number().int().min(15).max(240).default(60).optional(),
		capacity: z.number().int().min(0).default(1).optional(),
		clearExisting: z.boolean().default(false).optional(),
	}),
	params: z.object({ retreatId: idSchema }),
});
export type GenerateSantisimoSlots = z.infer<typeof GenerateSantisimoSlotsSchema>;

export const AdminCreateSantisimoSignupSchema = z.object({
	body: z.object({
		slotId: idSchema,
		name: z.string().min(1).max(120),
		phone: z.string().max(40).nullable().optional(),
		email: z.string().email().nullable().optional().or(z.literal('')),
		userId: idSchema.nullable().optional(),
	}),
	params: z.object({ retreatId: idSchema }),
});
export type AdminCreateSantisimoSignup = z.infer<typeof AdminCreateSantisimoSignupSchema>;

// -- Public request schemas --
export const PublicSantisimoSignupSchema = z.object({
	body: z.object({
		slotIds: z.array(idSchema).min(1, 'Selecciona al menos un horario'),
		name: z.string().min(1, 'El nombre es requerido').max(120),
		phone: z.string().max(40).optional(),
		email: z.string().email().optional().or(z.literal('')),
		recaptchaToken: z.string().optional(),
	}),
	params: z.object({ slug: z.string() }),
});
export type PublicSantisimoSignup = z.infer<typeof PublicSantisimoSignupSchema>;
