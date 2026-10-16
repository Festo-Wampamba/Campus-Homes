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
  // One cell per digit reads like the code on screen; the plain line under it
  // copies in one go and is what Gmail and phones detect for "Copy code".
  const digitCells = [...code]
    .map(
      (d) =>
        `<td style="padding:0 2px"><div style="width:36px;height:46px;line-height:46px;text-align:center;background:#ffffff;border:2px solid #087f80;border-radius:8px;font-family:'Courier New',monospace;font-size:24px;font-weight:700;color:#0b3f3f">${escapeHtml(d)}</div></td>`,
    )
    .join('');

  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head><body style="margin:0;padding:0;background:#f4f8f7;font-family:Arial,Helvetica,sans-serif;color:#173b3b">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(title)}: ${safeCode}. ${escapeHtml(expiry)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f8f7;padding:24px 8px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dce9e7;border-radius:18px;overflow:hidden">
<tr><td style="background:#087f80;padding:20px 24px"><div style="font-size:22px;font-weight:700;color:#ffffff">CampusHomes</div><div style="font-size:14px;font-style:italic;color:#fcb177;margin-top:2px">Live, Learn, Succeed.</div></td></tr>
<tr><td style="padding:28px 24px 8px">
<h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:#173b3b">${escapeHtml(title)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3d5c5c">${escapeHtml(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef7f6;border:1px solid #cfe5e2;border-radius:14px"><tr><td style="padding:18px 12px 16px" align="center">
<div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#087f80;margin-bottom:12px">Your code</div>
<table role="presentation" cellpadding="0" cellspacing="0"><tr>${digitCells}</tr></table>
<div style="margin-top:14px;font-size:14px;color:#3d5c5c">Code: <span style="font-family:'Courier New',monospace;font-size:18px;font-weight:700;letter-spacing:2px;color:#0b3f3f;-webkit-user-select:all;user-select:all">${safeCode}</span></div>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:#fff6ee;border-left:4px solid #e47e7e;border-radius:8px"><tr><td style="padding:12px 16px;font-size:14px;line-height:1.6;color:#173b3b"><strong>${escapeHtml(expiry)}</strong><br>Requesting a new code cancels this one; only the newest code works.</td></tr></table>
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#627979">Never share this code. CampusHomes staff will never ask you for it. If you didn't request it, you can ignore this email; your account stays safe.</p>
</td></tr>
<tr><td style="padding:20px 24px 24px;border-top:1px solid #edf3f2;font-size:12px;line-height:1.6;color:#91a3a3">CampusHomes Uganda · Inspected student hostels near Makerere University<br>Need help? <a href="mailto:hello@campushomes.co.ug" style="color:#087f80">hello@campushomes.co.ug</a></td></tr>
</table></td></tr></table></body></html>`;

  const text = `${title}

${intro}

Your code: ${code}

${expiry}
Requesting a new code cancels this one; only the newest code works.

Never share this code. CampusHomes staff will never ask you for it. If you didn't request it, you can ignore this email.

CampusHomes Uganda · hello@campushomes.co.ug`;
  return { subject: `${title}: ${code}`, html, text };
}

type EmailMessage = { subject: string; html: string; text: string };

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

export async function sendAuthEmail(env: Env, input: AuthEmailInput): Promise<void> {
  await deliver(env, input.to, content(input));
}
