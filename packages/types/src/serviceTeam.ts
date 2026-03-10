import { z } from 'zod';

const idSchema = z.string().uuid();

export enum ServiceTeamType {
	COCINA = 'cocina',
	MUSICA = 'musica',
	PALANCAS = 'palancas',
	LOGISTICA = 'logistica',
	LIMPIEZA = 'limpieza',
	ORACION = 'oracion',
	LITURGIA = 'liturgia',
	BIENVENIDA = 'bienvenida',
	REGISTRO = 'registro',
	COMEDOR = 'comedor',
	SALON = 'salon',
	CUARTOS = 'cuartos',
	TRANSPORTE = 'transporte',
	COMPRAS = 'compras',
	SNACKS = 'snacks',
	CONTINUA = 'continua',
	DINAMICA = 'dinamica',
	OTRO = 'otro',
}

export const serviceTeamMemberSchema = z.object({
	id: idSchema,
	serviceTeamId: idSchema,
	participantId: idSchema,
	role: z.string().nullable().optional(),
	participant: z.any().nullable().optional(),
	createdAt: z.coerce.date().optional(),
});
export type ServiceTeamMember = z.infer<typeof serviceTeamMemberSchema>;

export const serviceTeamSchema = z.object({
	id: idSchema,
	name: z.string(),
	teamType: z.nativeEnum(ServiceTeamType),
	description: z.string().nullable().optional(),
	instructions: z.string().nullable().optional(),
	retreatId: idSchema,
	leaderId: idSchema.nullable().optional(),
	leader: z.any().nullable().optional(),
	members: z.array(serviceTeamMemberSchema).optional(),
	priority: z.number().int().default(0),
	isActive: z.boolean().default(true),
	createdAt: z.coerce.date().optional(),
	updatedAt: z.coerce.date().optional(),
});
export type ServiceTeam = z.infer<typeof serviceTeamSchema>;

export const createServiceTeamSchema = z.object({
	name: z.string(),
	teamType: z.nativeEnum(ServiceTeamType),
	description: z.string().optional(),
	instructions: z.string().optional(),
	retreatId: idSchema,
	leaderId: idSchema.optional(),
	priority: z.number().int().default(0),
	isActive: z.boolean().default(true),
});
export type CreateServiceTeam = z.infer<typeof createServiceTeamSchema>;

export const updateServiceTeamSchema = z.object({
	name: z.string().optional(),
	teamType: z.nativeEnum(ServiceTeamType).optional(),
	description: z.string().nullable().optional(),
	instructions: z.string().nullable().optional(),
	leaderId: idSchema.nullable().optional(),
	priority: z.number().int().optional(),
	isActive: z.boolean().optional(),
});
export type UpdateServiceTeam = z.infer<typeof updateServiceTeamSchema>;
