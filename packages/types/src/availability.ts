import { z } from 'zod';

export const availabilityBlockSchema = z
	.object({
		id: z.string().uuid().optional(),
		startTime: z.coerce.date(),
		endTime: z.coerce.date(),
	})
	.refine((b) => b.endTime > b.startTime, {
		message: 'endTime must be greater than startTime',
		path: ['endTime'],
	});

export type AvailabilityBlock = z.infer<typeof availabilityBlockSchema>;

export const availabilityListSchema = z.array(availabilityBlockSchema);
export type AvailabilityList = z.infer<typeof availabilityListSchema>;
