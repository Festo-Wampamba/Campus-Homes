import { z } from 'zod';

/** Body of POST /uploads/sign. `size` is the exact byte length of the file the
 * caller will upload — the B2 signature binds it. */
export const signUploadSchema = z.object({
  contentType: z.string().min(1),
  size: z.number().int().positive(),
});
export type SignUploadInput = z.infer<typeof signUploadSchema>;
