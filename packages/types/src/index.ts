import { z } from 'zod';

// Base UUID schema for reuse
const idSchema = z.string().uuid();

// House Schema
export const houseSchema = z.object({
  id: idSchema,
  name: z.string(),
  address: z.string(),
  capacity: z.number().int().positive(),
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
  houseId: idSchema.optional(),
});
export type Retreat = z.infer<typeof retreatSchema>;

// Table Schema
export const tableSchema = z.object({
  id: idSchema,
  name: z.string(),
  retreatId: idSchema,
});
export type Table = z.infer<typeof tableSchema>;

// Walker Schema
export const walkerSchema = z.object({
  id: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  retreatId: idSchema,
  tableId: idSchema.optional(),
  roomId: idSchema.optional(),
});
export type Walker = z.infer<typeof walkerSchema>;

// Server Schema
export const serverSchema = z.object({
  id: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(),
  retreatId: idSchema,
  tableId: idSchema.optional(),
});
export type Server = z.infer<typeof serverSchema>;

// --- API Request Schemas ---

// POST /walkers
export const createWalkerSchema = z.object({
  body: walkerSchema.omit({ id: true }),
});
export type CreateWalker = z.infer<typeof createWalkerSchema.shape.body>;

// PUT /walkers/:id
export const updateWalkerSchema = z.object({
  body: walkerSchema.partial(),
  params: z.object({ id: idSchema }),
});
export type UpdateWalker = z.infer<typeof updateWalkerSchema.shape.body>;

// POST /servers
export const createServerSchema = z.object({
  body: serverSchema.omit({ id: true }),
});
export type CreateServer = z.infer<typeof createServerSchema.shape.body>;

// PUT /servers/:id
export const updateServerSchema = z.object({
  body: serverSchema.partial(),
  params: z.object({ id: idSchema }),
});
export type UpdateServer = z.infer<typeof updateServerSchema.shape.body>;

// POST /retreats
export const createRetreatSchema = z.object({
  body: retreatSchema.omit({ id: true }),
});
export type CreateRetreat = z.infer<typeof createRetreatSchema.shape.body>;

export * from './user';