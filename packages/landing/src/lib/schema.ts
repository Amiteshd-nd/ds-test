import { z } from 'zod';

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
});

