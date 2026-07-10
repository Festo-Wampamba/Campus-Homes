import { z } from 'zod';

import { DOC_TYPES, PROPERTY_STATUSES, PROPERTY_TYPES } from './enums.js';
import { uuid } from './common.js';

export const submitPropertySchema = z.object({
  name: z.string().min(2).max(200),
  streetAddress: z.string().min(3).max(300),
  type: z.enum(PROPERTY_TYPES).default('hostel'),
});
export type SubmitPropertyInput = z.infer<typeof submitPropertySchema>;

export const propertySchema = z.object({
  id: uuid,
  landlordId: uuid,
  name: z.string(),
  streetAddress: z.string(),
  // GPS is set by Ops during verification, never by the landlord.
  gpsLat: z.number().nullable(),
  gpsLon: z.number().nullable(),
  type: z.enum(PROPERTY_TYPES),
  status: z.enum(PROPERTY_STATUSES),
});
export type Property = z.infer<typeof propertySchema>;

export const propertyDocumentSchema = z.object({
  id: uuid,
  propertyId: uuid,
  docType: z.enum(DOC_TYPES),
  storageKey: z.string(),
});
export type PropertyDocument = z.infer<typeof propertyDocumentSchema>;
