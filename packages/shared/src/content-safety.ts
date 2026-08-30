// Keeps inquiry/chat communication on-platform (2026-08-30 product review):
// landlord and student should never need to trade phone numbers or links
// through a message — everything they need (reply, viewing request, status)
// already happens inside CampusHomes. Two independent checks, either one is
// enough to reject the message.
//
// Phone-number-like: a run of digits, each optionally followed by a single
// separator (space/dot/dash) before the next digit — deliberately format-
// agnostic so a local number (0771234567) and an international one
// (+256 771 234 567, or +1-555-123-4567) are both caught the same way.
// Threshold is 9 digits (a real Uganda mobile number is 9-10 digits, more
// with a country code) rather than a lower bar — short enough sequences
// (e.g. two 4-digit years mentioned in the same sentence) would otherwise
// false-positive.
const PHONE_LIKE_RE = /(?:\+?\d[\s.-]?){8,}\d/;

// URL-like: a scheme/www prefix, or a bare domain (catches wa.me / WhatsApp
// links specifically, since "call me, don't message" often becomes "here's
// my WhatsApp link" instead).
const URL_LIKE_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|ug|co|io|me|africa|info)\b/i;

export function containsContactInfo(text: string): boolean {
  return PHONE_LIKE_RE.test(text) || URL_LIKE_RE.test(text);
}

export const CONTACT_INFO_BLOCKED_MESSAGE =
  "Please keep phone numbers and links out of your message — reply and follow-up all happen right here on CampusHomes.";
