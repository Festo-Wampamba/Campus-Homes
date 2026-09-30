import { z } from 'zod';

/** Body of POST /uploads/sign. `size` is the exact byte length of the file the
 * caller will upload — the B2 signature binds it. `document` uploads (ID
 * scans, ownership papers, signatures) go to the private bucket and are only
 * readable through GET /uploads/document-url. */
export const signUploadSchema = z.object({
  contentType: z.string().min(1),
  size: z.number().int().positive(),
  purpose: z.enum(['media', 'document']).default('media'),
});
export type SignUploadInput = z.input<typeof signUploadSchema>;

/** Query of GET /uploads/document-url: a stored document key or legacy URL. */
export const documentUrlQuerySchema = z.object({
  key: z.string().trim().min(1).max(500),
});
