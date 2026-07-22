import {
  createAdminUserSchema,
  createSemesterSchema,
} from '@campushomes/shared';

const baseUser = {
  name: 'John Doe',
  email: 'john.doe@example.com',
  accountType: 'landlord' as const,
  status: 'active' as const,
  legalName: 'Doe Student Homes Ltd',
};

describe('admin input validation', () => {
  it('accepts a human-formatted Ugandan phone and stores its canonical E.164 value', () => {
    const result = createAdminUserSchema.safeParse({
      ...baseUser,
      phone: '+256 767 648 490',
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe('+256767648490');
  });

  it('requires a year of study for student accounts', () => {
    const result = createAdminUserSchema.safeParse({
      ...baseUser,
      accountType: 'student',
      university: 'MUK',
      legalName: undefined,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ['yearOfStudy'] }),
      ]));
    }
  });

  it.each(['male', 'female'])('accepts %s as a gender', (gender) => {
    expect(createAdminUserSchema.safeParse({ ...baseUser, gender }).success).toBe(true);
  });

  it('rejects unsupported gender values', () => {
    expect(createAdminUserSchema.safeParse({ ...baseUser, gender: 'other' }).success).toBe(false);
  });

  it('supports university-scoped numbered semesters', () => {
    expect(createSemesterSchema.safeParse({
      university: 'MUK',
      semesterType: 'semester_1',
      academicYear: '2026/27',
      startsOn: '2026-08-17',
      endsOn: '2026-12-18',
      reVerificationWindowStartsOn: '2026-08-01',
    }).success).toBe(true);
  });

  it('requires a label when the semester type is custom', () => {
    const result = createSemesterSchema.safeParse({
      university: 'MUK',
      semesterType: 'custom',
      academicYear: '2026/27',
      startsOn: '2026-08-17',
      endsOn: '2026-12-18',
      reVerificationWindowStartsOn: '2026-08-01',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: ['customName'] }),
      ]));
    }
  });
});
