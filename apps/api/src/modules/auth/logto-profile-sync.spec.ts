import { toLogtoUserDetails, type LogtoProfileRow } from './logto-profile-sync';

const row: LogtoProfileRow = {
  logtoUserId: 'logto-1',
  name: 'Jane Doe',
  username: 'jane_doe',
  role: 'student',
  gender: 'female',
  dateOfBirth: '2004-02-01',
  address: 'Kikoni, Kampala',
  nationality: 'Ugandan',
  contactPhone: '+256772000501',
  emergencyContactName: 'John Doe',
  emergencyContactPhone: '+256772000502',
};

describe('toLogtoUserDetails', () => {
  it('maps gender, birthdate and address onto Logto standard profile fields', () => {
    expect(toLogtoUserDetails(row).profile).toEqual({
      gender: 'female',
      birthdate: '2004-02-01',
      address: { formatted: 'Kikoni, Kampala' },
    });
  });

  it('keeps the contact phone in custom data, never as a sign-in phone', () => {
    expect(toLogtoUserDetails(row).customData.contactPhone).toBe('+256772000501');
  });

  it('carries the account type so the Logto console shows who the user is', () => {
    expect(toLogtoUserDetails(row).customData.accountType).toBe('student');
  });

  it('copies the username into Logto', () => {
    expect(toLogtoUserDetails(row).username).toBe('jane_doe');
  });

  it('skips a username Logto would reject for starting with a digit', () => {
    expect(toLogtoUserDetails({ ...row, username: '2jane' }).username).toBeNull();
  });

  it('caps the name at the 128 characters Logto accepts', () => {
    expect(toLogtoUserDetails({ ...row, name: 'a'.repeat(200) }).name).toHaveLength(128);
  });

  it('leaves unset profile fields out rather than sending nulls Logto would reject', () => {
    expect(toLogtoUserDetails({ ...row, gender: null, dateOfBirth: null, address: null }).profile).toEqual({});
  });
});
