import { z } from 'zod';

export const UserSchema = z.object({
	id: z.string(),
	email: z.string().email(),
	displayName: z.string(),
	googleId: z.string().optional(),
	photo: z.string().optional(),
	password: z.string().optional(),
	// Email verification (consumed by EmailVerificationBanner + acceptInvitation guard).
	// Optional in the schema so legacy /auth/status responses (without the field)
	// still parse; the banner treats undefined as verified to avoid false positives.
	emailVerified: z.boolean().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;
