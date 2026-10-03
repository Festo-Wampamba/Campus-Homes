import { z } from "zod";

// First-party, cookieless analytics. Only the pathname is sent (never the
// query string), so search terms and ids in URLs stay out of the log.
export const TRACKED_EVENT_TYPES = ["page_view", "cta_click"] as const;

export const trackEventSchema = z.object({
  type: z.enum(TRACKED_EVENT_TYPES),
  path: z.string().regex(/^\/[^?#\s]{0,299}$/, "Path must be a bare pathname"),
  cta: z.string().trim().min(1).max(60).optional(),
});

export type TrackEvent = z.infer<typeof trackEventSchema>;
