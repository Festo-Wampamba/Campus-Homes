/**
 * Photo categories on a verification visit. The staging column is jsonb and
 * predates categories, so both formats must survive: a photo staged today
 * carries its category, and one staged before this shipped must still publish
 * rather than being silently dropped on the floor.
 */
import { normalizeVisitPhotos, syncVisitSchema } from '@campushomes/shared';

describe('normalizeVisitPhotos', () => {
  it('keeps the category chosen at capture time', () => {
    expect(normalizeVisitPhotos([{ storageKey: 'abc', category: 'bathroom' }])).toEqual([
      { storageKey: 'abc', category: 'bathroom' },
    ]);
  });

  it('reads a photo staged before categories existed as uncategorised rather than dropping it', () => {
    expect(normalizeVisitPhotos(['legacy-key'])).toEqual([
      { storageKey: 'legacy-key', category: 'other' },
    ]);
  });

  it('returns nothing for a visit that staged no photos', () => {
    expect(normalizeVisitPhotos(null)).toEqual([]);
  });
});

describe('syncVisitSchema photo staging', () => {
  const base = {
    clientIdempotencyKey: '11111111-1111-4111-8111-111111111111',
    visitId: '22222222-2222-4222-8222-222222222222',
    checklist: {
      location_gps: { passed: true, notes: '' },
      rooms_capacity: { passed: true, notes: '' },
      amenities: { passed: true, notes: '' },
      photos: { passed: true, notes: '' },
      landlord_identity: { passed: true, notes: '' },
      safety: { passed: true, notes: '' },
    },
    visitGpsLat: 0.33,
    visitGpsLon: 32.56,
    startedAt: '2026-09-17T08:00:00.000Z',
    completedAt: '2026-09-17T09:00:00.000Z',
    result: 'passed' as const,
  };

  it('accepts a categorised photo', () => {
    const parsed = syncVisitSchema.safeParse({
      ...base,
      photoStorageKeys: [{ storageKey: 'k', category: 'compound' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('still accepts a draft saved offline before categories shipped', () => {
    const parsed = syncVisitSchema.safeParse({ ...base, photoStorageKeys: ['bare-key'] });
    expect(parsed.success).toBe(true);
  });

  it('rejects a category outside the catalogue', () => {
    const parsed = syncVisitSchema.safeParse({
      ...base,
      photoStorageKeys: [{ storageKey: 'k', category: 'rooftop' }],
    });
    expect(parsed.success).toBe(false);
  });
});
