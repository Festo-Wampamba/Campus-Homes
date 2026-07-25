import { z } from 'zod';

// ITU-T E.164 country calling codes for the 54 AU/UN member states — these
// assignments are essentially permanent, unlike Uganda-only validation which
// rejected every other African number outright.
export type AfricanCountry = { iso2: string; name: string; dialCode: string; example: string };

export const AFRICAN_COUNTRIES: AfricanCountry[] = [
  { iso2: 'DZ', name: 'Algeria', dialCode: '213', example: '551 23 45 67' },
  { iso2: 'AO', name: 'Angola', dialCode: '244', example: '923 123 456' },
  { iso2: 'BJ', name: 'Benin', dialCode: '229', example: '90 01 12 34' },
  { iso2: 'BW', name: 'Botswana', dialCode: '267', example: '71 123 456' },
  { iso2: 'BF', name: 'Burkina Faso', dialCode: '226', example: '70 12 34 56' },
  { iso2: 'BI', name: 'Burundi', dialCode: '257', example: '79 56 12 34' },
  { iso2: 'CV', name: 'Cabo Verde', dialCode: '238', example: '991 12 34' },
  { iso2: 'CM', name: 'Cameroon', dialCode: '237', example: '6 71 23 45 67' },
  { iso2: 'CF', name: 'Central African Republic', dialCode: '236', example: '70 01 23 45' },
  { iso2: 'TD', name: 'Chad', dialCode: '235', example: '63 01 23 45' },
  { iso2: 'KM', name: 'Comoros', dialCode: '269', example: '321 23 45' },
  { iso2: 'CG', name: 'Congo (Brazzaville)', dialCode: '242', example: '06 123 4567' },
  { iso2: 'CD', name: 'Congo (DRC)', dialCode: '243', example: '991 234 567' },
  { iso2: 'CI', name: "Côte d'Ivoire", dialCode: '225', example: '01 23 45 67 89' },
  { iso2: 'DJ', name: 'Djibouti', dialCode: '253', example: '77 83 10 01' },
  { iso2: 'EG', name: 'Egypt', dialCode: '20', example: '100 123 4567' },
  { iso2: 'GQ', name: 'Equatorial Guinea', dialCode: '240', example: '222 123 456' },
  { iso2: 'ER', name: 'Eritrea', dialCode: '291', example: '7 123 456' },
  { iso2: 'SZ', name: 'Eswatini', dialCode: '268', example: '7612 3456' },
  { iso2: 'ET', name: 'Ethiopia', dialCode: '251', example: '91 123 4567' },
  { iso2: 'GA', name: 'Gabon', dialCode: '241', example: '06 03 12 34' },
  { iso2: 'GM', name: 'Gambia', dialCode: '220', example: '301 2345' },
  { iso2: 'GH', name: 'Ghana', dialCode: '233', example: '24 123 4567' },
  { iso2: 'GN', name: 'Guinea', dialCode: '224', example: '601 12 34 56' },
  { iso2: 'GW', name: 'Guinea-Bissau', dialCode: '245', example: '955 012 345' },
  { iso2: 'KE', name: 'Kenya', dialCode: '254', example: '712 123 456' },
  { iso2: 'LS', name: 'Lesotho', dialCode: '266', example: '5012 3456' },
  { iso2: 'LR', name: 'Liberia', dialCode: '231', example: '77 012 3456' },
  { iso2: 'LY', name: 'Libya', dialCode: '218', example: '91 234 5678' },
  { iso2: 'MG', name: 'Madagascar', dialCode: '261', example: '32 12 345 67' },
  { iso2: 'MW', name: 'Malawi', dialCode: '265', example: '991 23 45 67' },
  { iso2: 'ML', name: 'Mali', dialCode: '223', example: '65 01 23 45' },
  { iso2: 'MR', name: 'Mauritania', dialCode: '222', example: '22 12 34 56' },
  { iso2: 'MU', name: 'Mauritius', dialCode: '230', example: '5251 2345' },
  { iso2: 'MA', name: 'Morocco', dialCode: '212', example: '650 123 456' },
  { iso2: 'MZ', name: 'Mozambique', dialCode: '258', example: '82 123 4567' },
  { iso2: 'NA', name: 'Namibia', dialCode: '264', example: '81 123 4567' },
  { iso2: 'NE', name: 'Niger', dialCode: '227', example: '93 12 34 56' },
  { iso2: 'NG', name: 'Nigeria', dialCode: '234', example: '802 123 4567' },
  { iso2: 'RW', name: 'Rwanda', dialCode: '250', example: '788 123 456' },
  { iso2: 'ST', name: 'São Tomé and Príncipe', dialCode: '239', example: '981 2345' },
  { iso2: 'SN', name: 'Senegal', dialCode: '221', example: '77 123 45 67' },
  { iso2: 'SC', name: 'Seychelles', dialCode: '248', example: '2 510 123' },
  { iso2: 'SL', name: 'Sierra Leone', dialCode: '232', example: '76 123 456' },
  { iso2: 'SO', name: 'Somalia', dialCode: '252', example: '61 123 4567' },
  { iso2: 'ZA', name: 'South Africa', dialCode: '27', example: '71 123 4567' },
  { iso2: 'SS', name: 'South Sudan', dialCode: '211', example: '922 123 456' },
  { iso2: 'SD', name: 'Sudan', dialCode: '249', example: '91 123 4567' },
  { iso2: 'TZ', name: 'Tanzania', dialCode: '255', example: '621 234 567' },
  { iso2: 'TG', name: 'Togo', dialCode: '228', example: '90 11 23 45' },
  { iso2: 'TN', name: 'Tunisia', dialCode: '216', example: '20 123 456' },
  { iso2: 'UG', name: 'Uganda', dialCode: '256', example: '771 234 567' },
  { iso2: 'ZM', name: 'Zambia', dialCode: '260', example: '95 512 3456' },
  { iso2: 'ZW', name: 'Zimbabwe', dialCode: '263', example: '71 234 5678' },
].sort((a, b) => a.name.localeCompare(b.name));

// Longest-first so a short dial code (e.g. '27') never shadows a longer one
// that happens to start with the same digits inside the regex alternation.
const DIAL_CODES = [...new Set(AFRICAN_COUNTRIES.map((country) => country.dialCode))].sort(
  (a, b) => b.length - a.length,
);
const DIAL_ALTERNATION = DIAL_CODES.join('|');

export function findCountryByDialCode(dialCode: string): AfricanCountry | undefined {
  return AFRICAN_COUNTRIES.find((country) => country.dialCode === dialCode);
}

// Accepts local (leading 0) or already-dialed input for a chosen country and
// always returns one canonical E.164 string — same contract normalizeUgPhone
// had, just parameterized by the country the user actually picked instead of
// assuming Uganda.
export function normalizePhoneForCountry(dialCode: string, value: string): string {
  const digits = value.trim().replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (digits.startsWith(dialCode)) return `+${digits}`;
  return `+${dialCode}${digits.replace(/^0+/, '')}`;
}

// Deliberately loose on national-number length (6-10 digits) — this only
// confirms the number belongs to a real African dial code, it does not
// re-impose a single country's exact format on everyone else. Strips
// spacing/punctuation the same way normalizeUgPhone always did, so a
// human-typed "+256 767 648 490" still validates and stores as one
// canonical E.164 string even when a caller bypasses the PhoneField UI.
export const africanPhone = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().replace(/[\s().-]/g, '') : value),
  z
    .string()
    .regex(
      new RegExp(`^\\+(?:${DIAL_ALTERNATION})\\d{6,10}$`),
      'Enter a valid African mobile number, e.g. +256 771 234 567',
    ),
);
