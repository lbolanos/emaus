import { z } from 'zod';

// Base UUID schema for reuse
const idSchema = z.string().uuid();

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
  cost: z.string().optional(),
  paymentInfo: z.string().optional(),
  paymentMethods: z.string().optional(),
});
export type Retreat = z.infer<typeof retreatSchema>;

// Table Schema
export const tableSchema = z.object({
  id: idSchema,
  name: z.string(),
  retreatId: idSchema,
});
export type Table = z.infer<typeof tableSchema>;

// Participant Schema (forward declaration)
export type Participant = z.infer<typeof participantSchema>;

// RetreatBed Schema
export const retreatBedSchema = z.object({
  id: idSchema,
  roomNumber: z.string(),
  bedNumber: z.string(),
  type: z.enum(['normal', 'litera', 'colchon']),
  defaultUsage: z.enum(['caminante', 'servidor']),
  retreatId: idSchema,
  participantId: idSchema.nullable().optional(),
  participant: z.lazy(() => participantSchema).nullable().optional(),
});
export type RetreatBed = z.infer<typeof retreatBedSchema>;

// Participant Schema
export const participantSchema = z.object({
  id: idSchema,
  id_on_retreat: z.number().int().positive().optional(),
  type: z.enum(['walker', 'server']),
  firstName: z.string(),
  lastName: z.string(),
  nickname: z.string().optional(),
  birthDate: z.coerce.date(),
  registrationDate: z.coerce.date(),
  lastUpdatedDate: z.coerce.date(),
  isCancelled: z.boolean().optional(),
  paymentDate: z.coerce.date().optional(),
  paymentAmount: z.preprocess(
    (val) => (val === null ? undefined : val),
    z.number().optional(),
  ),
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
  requestsSingleRoom: z.boolean().optional(),
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
    z.string().email({ message: "Invalid email address" }).optional(),
  ),
  emergencyContact2Name: z.string().optional(),
  emergencyContact2Relation: z.string().optional(),
  emergencyContact2HomePhone: z.string().optional(),
  emergencyContact2WorkPhone: z.string().optional(),
  emergencyContact2CellPhone: z.string().optional(),
  emergencyContact2Email: z.preprocess(
    (val) => (val === '' || val === null ? undefined : val),
    z.string().email({ message: "Invalid email address" }).optional(),
  ),
  tshirtSize: z.preprocess(
    (val) => (val === '' || val === null ? undefined : val),
    z.enum(['S', 'M', 'G', 'X', '2']).optional(),
  ),
  invitedBy: z.string().optional(),
  isInvitedByEmausMember: z.boolean().optional(),
  inviterHomePhone: z.string().optional(),
  inviterWorkPhone: z.string().optional(),
  inviterCellPhone: z.string().optional(),
  inviterEmail: z.preprocess(
    (val) => (val === '' || val === null ? undefined : val),
    z.string().email().optional(),
  ),
  pickupLocation: z.string().optional(),
  arrivesOnOwn: z.boolean().optional(),
  retreatId: idSchema,
  tableId: idSchema.optional(),
  retreatBedId: idSchema.nullable().optional(),
});

// --- API Request Schemas ---

// POST /participants/new
export const createParticipantSchema = z.object({
  body: participantSchema.omit({ id: true, id_on_retreat: true }),
});
export type CreateParticipant = z.infer<typeof createParticipantSchema.shape.body>;


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

export * from './user';
