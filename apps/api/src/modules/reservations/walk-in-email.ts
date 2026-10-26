import { escapeHtml, sendNotificationEmail } from '../../adapters/notification-email';
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

  await sendNotificationEmail(env, { to: [welcome.to], subject, html, kind: 'walk-in welcome' });
}
