import { z } from 'zod';

// Testimonial visibility enum
export const TestimonialVisibilityEnum = z.enum([
	'public',
	'friends',
	'retreat_participants',
	'private',
]);
export type TestimonialVisibility = z.infer<typeof TestimonialVisibilityEnum>;

// Testimonial schema
export const testimonialSchema = z.object({
	id: z.number(),
	userId: z.string().uuid(),
	retreatId: z.string().uuid().nullable(),
	content: z.string().min(10).max(2000),
	visibility: TestimonialVisibilityEnum.default('private'),
	allowLandingPage: z.boolean().default(false),
	approvedForLanding: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	// Join relations
	user: z
		.object({
			id: z.string().uuid(),
			displayName: z.string(),
			photo: z.string().nullable().optional(),
		})
		.optional(),
	retreat: z
		.object({
			id: z.string().uuid(),
			parish: z.string(),
		})
		.optional(),
});
export type Testimonial = z.infer<typeof testimonialSchema>;

// --- API Request Schemas ---

export const createTestimonialSchema = z.object({
	body: z.object({
		content: z.string().min(10).max(2000),
		retreatId: z.string().uuid().nullable(),
		visibility: TestimonialVisibilityEnum.default('private'),
		allowLandingPage: z.boolean().default(false),
	}),
});

export const updateTestimonialSchema = z.object({
	body: z
		.object({
			content: z.string().min(10).max(2000).optional(),
			visibility: TestimonialVisibilityEnum.optional(),
			allowLandingPage: z.boolean().optional(),
		})
		.partial(),
	params: z.object({ id: z.coerce.number() }),
});

export const getUserTestimonialsSchema = z.object({
	params: z.object({ userId: z.string().uuid() }),
});

export const getRetreatTestimonialsSchema = z.object({
	params: z.object({ retreatId: z.string().uuid() }),
});

export const approveLandingSchema = z.object({
	params: z.object({ id: z.coerce.number() }),
});

export const setDefaultVisibilitySchema = z.object({
	body: z.object({
		testimonialVisibilityDefault: TestimonialVisibilityEnum,
	}),
});
