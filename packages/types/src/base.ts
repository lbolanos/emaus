import { z } from 'zod';

export const UserSchema = z.object({
	id: z.string(),
	email: z.string().email(),
	displayName: z.string(),
	googleId: z.string().optional(),
	photo: z.string().optional(),
	password: z.string().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;
