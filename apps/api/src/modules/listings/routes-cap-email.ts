import type { Env } from '../../config/env';

// Same posture as inquiry-email.ts: plain fetch to Resend to the
// SUPPORT_NOTIFY_EMAILS inbox, dev fallback logs instead of sending.
export async function sendRoutesDailyCapEmail(env: Env): Promise<void> {
  const recipients = (env.SUPPORT_NOTIFY_EMAILS ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  const subject = '[CampusHomes] Google road-distance daily limit reached';

  if (recipients.length === 0) {
    console.log(`[routes] SUPPORT_NOTIFY_EMAILS unset — not emailed: ${subject}`);
    return;
  }

  const html = `
    <p>The daily limit on the Google Routes API key has been reached.</p>
    <p>Hostels that already have a road distance keep showing it. Hostels without one
    show no distance until the limit resets at midnight Pacific time
    (10:00 or 11:00 Uganda time). CampusHomes retries every hour and resumes
    on its own after the reset; nothing needs doing and nothing is charged.</p>
    <p>If this happens often, raise the "requests per day" quota for the Routes API
    in the Google Cloud console.</p>
  `;

  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] ${subject} → ${recipients.join(', ')}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to: recipients, subject, html }),
  });
  if (!res.ok) {
    // Status only; the body may contain provider details we don't log.
    throw new Error(`Resend rejected routes daily-cap email with status ${res.status}`);
  }
}
