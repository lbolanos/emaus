import { z } from 'zod';

const idSchema = z.string().uuid();

/**
 * Criterios de filtrado guardados en un "segmento" reutilizable. Replican los
 * filtros disponibles en `ParticipantList.vue` para que un segmento guardado se
 * pueda reaplicar tal cual (Fase 1) y, más adelante, evaluar en backend como
 * audiencia de una secuencia (Fase 3).
 *
 * Todos los campos son opcionales: un segmento vacío equivale a "todos los
 * participantes del retiro/comunidad".
 */
export const segmentFiltersSchema = z.object({
	// Tipo de participante (campo directo de Participant).
	participantType: z.enum(['walker', 'server', 'waiting', 'partial_server']).nullish(),
	// Tiene AL MENOS uno de estos tags (intersección).
	tagIds: z.array(idSchema).optional(),
	// Estado de pago derivado (Participant.paymentStatus getter).
	paymentStatus: z.enum(['paid', 'partial', 'unpaid', 'overpaid', 'scholarship']).nullish(),
	maritalStatus: z.enum(['S', 'C', 'D', 'V', 'O']).nullish(),
	// Confirmación de asistencia (retreat_participant.attendanceConfirmation).
	attendanceFilter: z.enum(['all', 'pending', 'confirmed', 'declined']).optional(),
	// Activos vs cancelados.
	cancelStatus: z.enum(['active', 'canceled']).optional(),
	// Búsqueda libre (firstName/lastName/email/nickname).
	search: z.string().optional(),
	// Solo scope community: estados de seguimiento del miembro.
	memberStates: z.array(z.string()).optional(),
});

export type SegmentFilters = z.infer<typeof segmentFiltersSchema>;

export const segmentScope = z.enum(['retreat', 'community']);
export type SegmentScope = z.infer<typeof segmentScope>;

export const savedSegmentSchema = z.object({
	id: idSchema,
	name: z.string().min(1, 'El nombre es requerido').max(150),
	scope: segmentScope,
	retreatId: idSchema.nullish(),
	communityId: idSchema.nullish(),
	filters: segmentFiltersSchema,
	createdBy: idSchema.nullish(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export const createSavedSegmentSchema = z.object({
	body: savedSegmentSchema
		.omit({ id: true, createdBy: true, createdAt: true, updatedAt: true })
		.refine((v) => (v.scope === 'retreat' ? !!v.retreatId : !!v.communityId), {
			message: 'retreatId requerido para scope retreat; communityId para scope community',
		}),
});

export const updateSavedSegmentSchema = z.object({
	body: z.object({
		name: z.string().min(1).max(150).optional(),
		filters: segmentFiltersSchema.optional(),
	}),
	params: z.object({ id: idSchema }),
});

export type SavedSegment = z.infer<typeof savedSegmentSchema>;
export type CreateSavedSegment = z.infer<typeof createSavedSegmentSchema>;
export type UpdateSavedSegment = z.infer<typeof updateSavedSegmentSchema>;
