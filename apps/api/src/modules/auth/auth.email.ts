import { STAFF_ROLE_LABELS, type StaffRoleKey } from '@campushomes/shared';

import type { Env } from '../../config/env';

export type AuthEmailKind = 'verify-email' | 'reset-password' | 'set-password';
export type VerificationEmailKind = 'sign-in' | 'register' | 'forgot-password' | 'generic';

type AuthEmailInput = {
  to: string;
  url: string;
  name: string;
  kind: AuthEmailKind;
};

// A brand-new user (admin-invited staff, or a phone/Google user who never
// set a password) has no credential account yet — Better Auth's reset flow
// creates one on submit. Copy the email accordingly: "set" for the first
// time, "reset" for a genuine change.
export function pickPasswordEmailKind(hasCredentialAccount: boolean): AuthEmailKind {
  return hasCredentialAccount ? 'reset-password' : 'set-password';
}

const COPY: Record<AuthEmailKind, { title: string; action: string; intro: string }> = {
  'verify-email': {
    title: 'Verify your CampusHomes email',
    action: 'Verify email address',
    intro: 'Confirm your email address to finish setting up your CampusHomes account.',
  },
  'reset-password': {
    title: 'Reset your CampusHomes password',
    action: 'Reset password',
    intro: 'Use the secure link below to choose a new CampusHomes password.',
  },
  'set-password': {
    title: 'Set up your CampusHomes password',
    action: 'Set password',
    intro:
      'A CampusHomes administrator created your staff account. Set a password with the secure link below to sign in.',
  },
};

function content(input: AuthEmailInput) {
  const { title, action, intro } = COPY[input.kind];
  return {
    subject: title,
    html: `<!doctype html><html><body style="margin:0;background:#f4f8f7;color:#173b3b;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:36px 32px;background:#fff;border:1px solid #dce9e7;border-radius:18px"><div style="font-size:24px;font-weight:700;color:#087f80">CampusHomes</div><p style="color:#e47e7e;font-size:16px;font-style:italic;margin-top:4px">Live, Learn, Succeed.</p><p style="font-size:16px;line-height:1.6">Hi ${escapeHtml(input.name || 'there')},</p><p style="font-size:16px;line-height:1.6">${intro}</p><p style="margin:28px 0"><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:13px 20px;border-radius:9px;background:#087f80;color:#fff;text-decoration:none;font-weight:700">${action}</a></p><p style="font-size:13px;line-height:1.6;color:#627979">This link expires automatically. If you did not request this, you can safely ignore this email.</p><p style="font-size:12px;color:#91a3a3">CampusHomes Uganda · Live, Learn, Succeed.</p></main></body></html>`,
    text: `${title}\n\nHi ${input.name || 'there'},\n\n${intro}\n\n${input.url}\n\nThis link expires automatically.`,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char);
}

// Logto's default verificationCodePolicy.expirationDuration (600 s), which
// neither staging nor production overrides. Logto also deletes a user's
// unused code when they request a new one, so only the newest code works.
export const VERIFICATION_CODE_TTL_MINUTES = 10;

const VERIFICATION_COPY: Record<VerificationEmailKind, { heading: string; intro: string }> = {
  'sign-in': { heading: 'sign-in code', intro: 'Use this code to sign in to CampusHomes.' },
  register: { heading: 'verification code', intro: 'Use this code to finish creating your CampusHomes account.' },
  'forgot-password': { heading: 'password reset code', intro: 'Use this code to reset your CampusHomes password.' },
  generic: { heading: 'verification code', intro: "Use this code to confirm it's you on CampusHomes." },
};

/** Exported for tests. `now` is when Logto issued the code (≈ when its webhook calls us). */
export function verificationContent(kind: VerificationEmailKind, code: string, now = new Date()): EmailMessage {
  const { heading, intro } = VERIFICATION_COPY[kind];
  const title = `Your CampusHomes ${heading}`;
  const expiresAt = new Date(now.getTime() + VERIFICATION_CODE_TTL_MINUTES * 60_000).toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Kampala',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const expiry = `This code expires in ${VERIFICATION_CODE_TTL_MINUTES} minutes, at ${expiresAt} EAT.`;
  const safeCode = escapeHtml(code);
  // Gmail's "Copy code" chip is Gmail's own detection, not something a sender
  // can add. It needs one clear, unbroken code, so the body shows it once in a
  // plain sentence, never split into per-digit boxes.
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head><body style="margin:0;padding:0;background:#f4f8f7;font-family:Arial,Helvetica,sans-serif;color:#173b3b">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(title)}: ${safeCode}. ${escapeHtml(expiry)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8f7;padding:24px 8px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dce9e7;border-radius:18px;overflow:hidden">
<tr><td style="background:#087f80;padding:20px 24px"><div style="font-size:22px;font-weight:700;color:#ffffff">CampusHomes</div><div style="font-size:14px;font-style:italic;color:#fcb177;margin-top:2px">Live, Learn, Succeed.</div></td></tr>
<tr><td style="padding:28px 24px 8px">
<h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:#173b3b">${escapeHtml(title)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d5c5c">${escapeHtml(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef7f6;border:1px solid #cfe5e2;border-radius:14px"><tr><td style="padding:20px 16px" align="center">
<p style="margin:0 0 6px;font-size:14px;color:#3d5c5c">Your verification code is</p>
<p style="margin:0;font-family:'Courier New',monospace;font-size:34px;font-weight:700;color:#0b3f3f">${safeCode}</p>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:#fff6ee;border-left:4px solid #e47e7e;border-radius:8px"><tr><td style="padding:12px 16px;font-size:14px;line-height:1.6;color:#173b3b"><strong>${escapeHtml(expiry)}</strong><br>Requesting a new code cancels this one; only the newest code works.</td></tr></table>
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#627979">Never share this code. CampusHomes staff will never ask you for it. If you didn't request it, you can ignore this email; your account stays safe.</p>
</td></tr>
<tr><td style="padding:20px 24px 24px;border-top:1px solid #edf3f2;font-size:12px;line-height:1.6;color:#91a3a3">CampusHomes Uganda · Inspected student hostels near Makerere University<br>Need help? <a href="mailto:hello@campushomes.co.ug" style="color:#087f80">hello@campushomes.co.ug</a></td></tr>
</table></td></tr></table></body></html>`;

  const text = `${title}

${intro}

Your verification code is ${code}

${expiry}
Requesting a new code cancels this one; only the newest code works.

Never share this code. CampusHomes staff will never ask you for it. If you didn't request it, you can ignore this email.

CampusHomes Uganda · hello@campushomes.co.ug`;
  return { subject: `${title}: ${code}`, html, text };
}

type EmailMessage = { subject: string; html: string; text: string };

export type StaffInvitationEmailInput = {
  name: string | null;
  roleKey: StaffRoleKey;
  scopeType: string;
  scopeId: string | null;
  inviterName: string | null;
  url: string;
  expiresAt: Date;
};

function scopeLabel(scopeType: string, scopeId: string | null): string {
  if (scopeType === 'platform_wide') return 'All of CampusHomes (platform-wide)';
  if (scopeType === 'catchment' && scopeId) return `${scopeId} catchment`;
  return scopeId ? `${scopeType.replace(/_/g, ' ')} ${scopeId}` : scopeType.replace(/_/g, ' ');
}

/** Exported for tests. A full, branded staff invitation: who invited them, to
 * which role and scope, when the link expires, and exactly what happens next
 * (including the mandatory authenticator app). */
export function invitationContent(input: StaffInvitationEmailInput): EmailMessage {
  const role = STAFF_ROLE_LABELS[input.roleKey];
  const scope = scopeLabel(input.scopeType, input.scopeId);
  const kampala = { timeZone: 'Africa/Kampala' } as const;
  const expires = `${input.expiresAt.toLocaleDateString('en-GB', { ...kampala, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${input.expiresAt.toLocaleTimeString('en-GB', { ...kampala, hour: 'numeric', minute: '2-digit', hour12: true })} EAT`;
  const greeting = `Hi ${input.name?.trim() || 'there'},`;
  const inviter = input.inviterName?.trim() || 'A CampusHomes administrator';
  const subject = `You have been invited to join CampusHomes as ${role}`;
  // A brand-new staff account only joins Logto's MFA-required organization
  // once that first sign-in has created it, so authenticator setup always
  // happens on the second sign-in (see addToStaffMfaOrganization).
  const steps = [
    'Open the secure link below. It signs you in with this email address; no password is needed yet.',
    'Confirm your details when asked. CampusHomes then tells you that staff accounts need 2-step verification.',
    'Choose Administration or Operations and sign in a second time with the same email. This time you are asked to set up an authenticator app (such as Google Authenticator or Microsoft Authenticator). Every staff account needs it; it cannot be skipped.',
    'You land in your CampusHomes workspace, ready to work.',
  ];
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;width:110px;font-size:13px;color:#627979;vertical-align:top">${label}</td><td style="padding:6px 0;font-size:14px;font-weight:700;color:#173b3b">${escapeHtml(value)}</td></tr>`;
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;padding:0;background:#f4f8f7;font-family:Arial,Helvetica,sans-serif;color:#173b3b">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(inviter)} invited you to join CampusHomes as ${escapeHtml(role)}. The link expires ${escapeHtml(expires)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8f7;padding:24px 8px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #dce9e7;border-radius:18px;overflow:hidden">
<tr><td style="background:#087f80;padding:20px 28px"><div style="font-size:22px;font-weight:700;color:#ffffff">CampusHomes</div><div style="font-size:14px;font-style:italic;color:#fcb177;margin-top:2px">Live, Learn, Succeed.</div></td></tr>
<tr><td style="padding:28px 28px 8px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#173b3b">You're invited to the CampusHomes team</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${escapeHtml(greeting)}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3d5c5c">${escapeHtml(inviter)} invited you to join CampusHomes, Uganda's platform for inspected student accommodation. Accept the invitation to set up your staff account.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef7f6;border:1px solid #cfe5e2;border-radius:14px"><tr><td style="padding:14px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${row('Role', role)}${row('Access', scope)}${row('Invited by', inviter)}${row('Link expires', expires)}
</table></td></tr></table>
<p style="margin:28px 0;text-align:center"><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:14px 28px;border-radius:10px;background:#087f80;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700">Accept invitation</a></p>
<h2 style="margin:0 0 10px;font-size:16px;color:#173b3b">What happens next</h2>
<ol style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.7;color:#3d5c5c">${steps.map((step) => `<li style="margin-bottom:4px">${escapeHtml(step)}</li>`).join('')}</ol>
<p style="margin:0 0 6px;font-size:13px;color:#627979">Button not working? Copy and paste this link into your browser:</p>
<p style="margin:0 0 20px;font-size:12px;line-height:1.5;word-break:break-all"><a href="${escapeHtml(input.url)}" style="color:#087f80">${escapeHtml(input.url)}</a></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff6ee;border-left:4px solid #e47e7e;border-radius:8px"><tr><td style="padding:12px 16px;font-size:13px;line-height:1.6;color:#173b3b"><strong>This link is personal and works once.</strong> Don't forward it. If you weren't expecting this invitation, ignore this email and no account is created.</td></tr></table>
</td></tr>
<tr><td style="padding:20px 28px 24px;border-top:1px solid #edf3f2;font-size:12px;line-height:1.6;color:#91a3a3">CampusHomes Uganda · Inspected student hostels near Makerere University<br>Questions about this invitation? <a href="mailto:hello@campushomes.co.ug" style="color:#087f80">hello@campushomes.co.ug</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = `${subject}

${greeting}

${inviter} invited you to join CampusHomes, Uganda's platform for inspected student accommodation. Accept the invitation to set up your staff account.

Role: ${role}
Access: ${scope}
Invited by: ${inviter}
Link expires: ${expires}

Accept the invitation:
${input.url}

What happens next:
${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

This link is personal and works once. Don't forward it. If you weren't expecting this invitation, ignore this email and no account is created.

CampusHomes Uganda · hello@campushomes.co.ug`;
  return { subject, html, text };
}

async function deliver(env: Env, to: string, message: EmailMessage): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === 'production') throw new Error('Email delivery unavailable');
    // Local development only (the Docker image pins NODE_ENV=production):
    // print the message so sign-in codes and invite links work without Resend.
    if (env.NODE_ENV === 'development') console.info(`[email:dev] To ${to}: ${message.subject}\n${message.text}`);
    else console.info('[email:dev] Delivery skipped: provider is not configured');
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to: [to], subject: message.subject, html: message.html, text: message.text }),
  });
  if (!response.ok) {
    throw new Error(`Resend email delivery failed: HTTP ${response.status}`);
  }
}

/** For Logto's HTTP Email connector — a plain verification code, not a
 * clickable link (see logto-email-webhook.controller.ts). Kept separate
 * from sendAuthEmail's link-shaped templates rather than overloading them. */
export async function sendVerificationCodeEmail(
  env: Env,
  input: { to: string; code: string; kind: VerificationEmailKind },
): Promise<void> {
  await deliver(env, input.to, verificationContent(input.kind, input.code));
}

export async function sendStaffInvitationEmail(env: Env, to: string, input: StaffInvitationEmailInput): Promise<void> {
  await deliver(env, to, invitationContent(input));
}

export async function sendAuthEmail(env: Env, input: AuthEmailInput): Promise<void> {
  await deliver(env, input.to, content(input));
}
