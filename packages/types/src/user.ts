import { z } from 'zod';

export const userSchema = z.object({
  id: z.string().uuid(),
  googleId: z.string().optional(),
  email: z.string().email(),
  displayName: z.string(),
  photo: z.string().url().optional(),
  password: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof userSchema>;
