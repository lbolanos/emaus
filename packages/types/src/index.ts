import { z } from 'zod';

// Base UUID schema for reuse
const idSchema = z.string().uuid();

// Bed Schema
export const bedSchema = z.object({
	id: idSchema.optional(),
	roomNumber: z.string(),
	bedNumber: z.string(),
	floor: z.number().int().optional(),
	type: z.enum(['normal', 'litera', 'colchon']),
	defaultUsage: z.enum(['caminante', 'servidor']),
	houseId: idSchema.optional(),
});
export type Bed = z.infer<typeof bedSchema>;

// House Schema
export const houseSchema = z.object({
	id: idSchema,
	name: z.string(),
	address1: z.string(),
	address2: z.string().optional(),
	city: z.string(),
	state: z.string(),
	zipCode: z.string(),
	country: z.string(),
	capacity: z.number().int().positive(),
	latitude: z.number().optional(),
	longitude: z.number().optional(),
	googleMapsUrl: z.string().url().optional(),
	notes: z.string().optional(),
	beds: z.array(bedSchema).optional(),
});
export type House = z.infer<typeof houseSchema>;

// Room Schema
export const roomSchema = z.object({
	id: idSchema,
	roomNumber: z.string(),
	capacity: z.number().int().positive(),
	houseId: idSchema,
});
export type Room = z.infer<typeof roomSchema>;

// Retreat Schema
export const retreatSchema = z.object({
	id: idSchema,
	parish: z.string(),
	startDate: z.coerce.date(),
	endDate: z.coerce.date(),
	houseId: idSchema,
	openingNotes: z.string().optional(),
	closingNotes: z.string().optional(),
	thingsToBringNotes: z.string().optional(),
	contactPhones: z.string().optional(),
	cost: z.string().optional(),
	paymentInfo: z.string().optional(),
	paymentMethods: z.string().optional(),
	max_walkers: z.number().int().positive().optional(),
	max_servers: z.number().int().positive().optional(),
	isPublic: z.boolean().default(false),
	roleInvitationEnabled: z.boolean().default(true),
});
export type Retreat = z.infer<typeof retreatSchema>;

// Table Schema
export const tableSchema = z.object({
	id: idSchema,
	name: z.string(),
	retreatId: idSchema,
});
export type Table = z.infer<typeof tableSchema>;

// Responsability Schema
export enum ResponsabilityType {
	LIDER = 'lider',
	COLIDER = 'colider',
	SERVIDOR = 'servidor',
	MUSICA = 'musica',
	ORACION = 'oracion',
	LIMPIEZA = 'limpieza',
	COCINA = 'cocina',
	OTRO = 'otro',
}

export const responsabilitySchema = z.object({
	id: idSchema,
	name: z.string(),
	description: z.string().optional(),
	responsabilityType: z.nativeEnum(ResponsabilityType).default(ResponsabilityType.OTRO),
	isLeadership: z.boolean().default(false),
	priority: z.number().int().min(0).default(0),
	isActive: z.boolean().default(true),
	retreatId: idSchema,
	participant: z.lazy(() => participantSchema).optional(),
	participantId: idSchema.optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});
export type Responsability = z.infer<typeof responsabilitySchema>;

// RetreatBed Schema
export const retreatBedSchema = z.object({
	id: idSchema,
	roomNumber: z.string(),
	bedNumber: z.string(),
	floor: z.number().int().optional(),
	type: z.enum(['normal', 'litera', 'colchon']),
	defaultUsage: z.enum(['caminante', 'servidor']),
	retreatId: idSchema,
	participantId: idSchema.nullable().optional(),
	participant: z.any().nullable().optional(), // Use any to avoid circular reference
});
export type RetreatBed = z.infer<typeof retreatBedSchema>;

// TableMesa Schema
export const tableMesaSchema = z.object({
	id: idSchema,
	name: z.string(),
	retreatId: idSchema,
	lider: z.any().nullable().optional(),
	colider1: z.any().nullable().optional(),
	colider2: z.any().nullable().optional(),
	walkers: z.array(z.any()).optional(),
});
export type TableMesa = z.infer<typeof tableMesaSchema>;

// Participant Schema
export const participantSchema = z.object({
	id: idSchema,
	id_on_retreat: z.number().int().positive().optional(),
	type: z.enum(['walker', 'server', 'waiting']),
	firstName: z.string(),
	lastName: z.string(),
	nickname: z.string().optional(),
	birthDate: z.coerce.date(),
	registrationDate: z.coerce.date(),
	lastUpdatedDate: z.coerce.date(),
	isCancelled: z.boolean().optional(),
	paymentDate: z.coerce.date().optional(),
	paymentAmount: z.preprocess((val) => (val === null ? undefined : val), z.number().optional()),
	isScholarship: z.boolean().optional(),
	palancasCoordinator: z.preprocess(
		(val) => (val === '' || val === null ? undefined : val),
		z.string().optional(),
	),
	palancasRequested: z.preprocess(
		(val) => (val === null ? undefined : val),
		z.boolean().optional(),
	),
	palancasReceived: z.preprocess(
		(val) => (val === '' || val === null ? undefined : val),
		z.string().optional(),
	),
	palancasNotes: z.preprocess(
		(val) => (val === '' || val === null ? undefined : val),
		z.string().optional(),
	),
	requestsSingleRoom: z.preprocess(
		(val) => (val === null ? undefined : val),
		z.boolean().optional(),
	),
	notes: z.preprocess(
		(val) => (val === '' || val === null ? undefined : val),
		z.string().optional(),
	),
	maritalStatus: z.enum(['S', 'C', 'D', 'V', 'O']),
	street: z.string(),
	houseNumber: z.string(),
	postalCode: z.string(),
	neighborhood: z.string(),
	city: z.string(),
	state: z.string(),
	country: z.string(),
	parish: z.string().optional(),
	homePhone: z.string().optional(),
	workPhone: z.string().optional(),
	cellPhone: z.string(),
	email: z.string().email(),
	occupation: z.string(),
	snores: z.boolean(),
	hasMedication: z.boolean(),
	medicationDetails: z.string().optional(),
	medicationSchedule: z.string().optional(),
	hasDietaryRestrictions: z.boolean(),
	dietaryRestrictionsDetails: z.string().optional(),
	sacraments: z.array(z.enum(['baptism', 'communion', 'confirmation', 'marriage', 'none'])),
	emergencyContact1Name: z.string(),
	emergencyContact1Relation: z.string(),
	emergencyContact1HomePhone: z.string().optional(),
	emergencyContact1WorkPhone: z.string().optional(),
	emergencyContact1CellPhone: z.string(),
	emergencyContact1Email: z.preprocess(
		(val) => (val === '' || val === null ? undefined : val),
		z.string().email({ message: 'Invalid email address' }).optional(),
	),
	emergencyContact2Name: z.string().optional(),
	emergencyContact2Relation: z.string().optional(),
	emergencyContact2HomePhone: z.string().optional(),
	emergencyContact2WorkPhone: z.string().optional(),
	emergencyContact2CellPhone: z.string().optional(),
	emergencyContact2Email: z.preprocess(
		(val) => (val === '' || val === null ? undefined : val),
		z.string().email({ message: 'Invalid email address' }).optional(),
	),
	tshirtSize: z.preprocess(
		(val) => (val === '' || val === null ? undefined : val),
		z.enum(['S', 'M', 'G', 'X', '2']).optional(),
	),
	needsWhiteShirt: z.enum(['S', 'M', 'G', 'X', '2', 'null']).nullable().optional(),
	needsBlueShirt: z.enum(['S', 'M', 'G', 'X', '2', 'null']).nullable().optional(),
	needsJacket: z.enum(['S', 'M', 'G', 'X', '2', 'null']).nullable().optional(),
	invitedBy: z.string().optional(),
	isInvitedByEmausMember: z.boolean().nullable().optional(),
	inviterHomePhone: z.string().optional(),
	inviterWorkPhone: z.string().optional(),
	inviterCellPhone: z.string().optional(),
	inviterEmail: z.preprocess(
		(val) => (val === '' || val === null ? undefined : val),
		z.string().email().optional(),
	),
	family_friend_color: z.string().optional(),
	pickupLocation: z.string().optional(),
	arrivesOnOwn: z.preprocess((val) => (val === null ? undefined : val), z.boolean().optional()),
	retreatId: idSchema,
	tableId: idSchema.nullable().optional(),
	retreatBedId: idSchema.nullable().optional(),
	tableMesa: tableMesaSchema.optional(),
	retreatBed: retreatBedSchema.nullable().optional(),
});
export type Participant = z.infer<typeof participantSchema>;

// Remove duplicate declaration - already defined above

// --- API Request Schemas ---

// POST /participants/new
export const createParticipantSchema = z.object({
	body: participantSchema.omit({ id: true, lastUpdatedDate: true, registrationDate: true }),
});
export type CreateParticipant = z.infer<typeof createParticipantSchema.shape.body>;

export const TableSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	retreatId: z.string().uuid(),
});
export const createTableSchema = TableSchema.omit({ id: true });

// PUT /participants/:id
export const updateParticipantSchema = z.object({
	body: participantSchema.partial(),
	params: z.object({ id: idSchema }),
});
export type UpdateParticipant = z.infer<typeof updateParticipantSchema.shape.body>;

// POST /retreats
export const createRetreatSchema = z.object({
	body: retreatSchema.omit({ id: true }),
});
export type CreateRetreat = z.infer<typeof createRetreatSchema.shape.body>;

// PUT /retreats/:id
export const updateRetreatSchema = z.object({
	body: retreatSchema.omit({ id: true }).partial(),
	params: z.object({ id: idSchema }),
});
export type UpdateRetreat = z.infer<typeof updateRetreatSchema.shape.body>;

// POST /houses
export const createHouseSchema = z.object({
	body: houseSchema.omit({ id: true }),
});
export type CreateHouse = z.infer<typeof createHouseSchema.shape.body>;

// PUT /houses/:id
export const updateHouseSchema = z.object({
	body: houseSchema.partial(),
	params: z.object({ id: idSchema }),
});
export type UpdateHouse = z.infer<typeof updateHouseSchema.shape.body>;

// POST /responsibilities
export const createResponsabilitySchema = z.object({
	body: responsabilitySchema.omit({ id: true, participant: true, participantId: true }),
});
export type CreateResponsability = z.infer<typeof createResponsabilitySchema.shape.body>;

// PUT /responsibilities/:id
export const updateResponsabilitySchema = z.object({
	body: responsabilitySchema
		.omit({ id: true, retreatId: true, participant: true, participantId: true })
		.partial(),
	params: z.object({ id: idSchema }),
});
export type UpdateResponsability = z.infer<typeof updateResponsabilitySchema.shape.body>;

// User types (avoid conflicts with permissions exports)
export type {
	User,
	UserRole,
	UserRetreat,
	Permission as UserPermission,
	Role as UserRoleType,
	RolePermission,
	UserPermission as UserPermissionType,
	UserRoleDetail,
	UserProfile,
} from './user';

export * from './message-template';
export * from './permissions';

// Payment Schema
export const paymentSchema = z.object({
	id: idSchema,
	participantId: idSchema,
	retreatId: idSchema,
	amount: z.number().positive(),
	paymentDate: z.coerce.date(),
	paymentMethod: z.enum(['cash', 'transfer', 'check', 'card', 'other']),
	referenceNumber: z.string().optional(),
	notes: z.string().optional(),
	recordedBy: idSchema,
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	participant: z.lazy(() => participantSchema).optional(),
	retreat: z.lazy(() => retreatSchema).optional(),
	recordedByUser: z.any().optional(), // Use any to avoid circular reference
});
export type Payment = z.infer<typeof paymentSchema>;

// Payment Request Schemas
export const createPaymentSchema = z.object({
	body: paymentSchema.omit({
		id: true,
		createdAt: true,
		updatedAt: true,
		participant: true,
		retreat: true,
		recordedByUser: true,
	}),
});
export type CreatePayment = z.infer<typeof createPaymentSchema.shape.body>;

export const updatePaymentSchema = z.object({
	body: paymentSchema
		.omit({
			id: true,
			participantId: true,
			retreatId: true,
			recordedBy: true,
			createdAt: true,
			updatedAt: true,
			participant: true,
			retreat: true,
			recordedByUser: true,
		})
		.partial(),
	params: z.object({ id: idSchema }),
});
export type UpdatePayment = z.infer<typeof updatePaymentSchema.shape.body>;

// Role management types
export type {
	RoleRequest,
	CreateRoleRequest,
	UpdateRoleRequest,
	PermissionOverride,
	CreatePermissionOverride,
} from './user';
