import type { Env } from '../../config/env';

// Same posture as payment-receipt-email.ts. SMS codes don't reach students yet
// (Africa's Talking sandbox, 2026-10-23), so email is the reliable channel.
export async function sendWalkInWelcomeEmail(
  env: Env,
  welcome: { to: string; studentName: string; propertyName: string; roomLabel: string; phone: string },
): Promise<void> {
  const subject = `${welcome.propertyName} booked you a room on CampusHomes`;
  const html = `
    <p>Hello ${escapeHtml(welcome.studentName)},</p>
    <p>${escapeHtml(welcome.propertyName)} added your booking for <strong>${escapeHtml(welcome.roomLabel)}</strong> on CampusHomes.</p>
    <p>Sign in with this email address (or your phone ${escapeHtml(welcome.phone)}) to see your booking, message your landlord and confirm your move-in.</p>
    <p><a href="${env.AUTH_APP_URL}/reservations">Open my reservations</a></p>
  `;

  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] ${subject} → ${welcome.to}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to: [welcome.to], subject, html }),
  });
  if (!res.ok) {
    // Status only; the body may contain provider details we don't log.
    throw new Error(`Resend rejected walk-in welcome email with status ${res.status}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
