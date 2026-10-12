# WhatsApp OTP setup — step-by-step

Guided setup for sending CampusHomes sign-in codes over the **official WhatsApp
Cloud API**. Started 2026-10-12, paused at Step 1 while the URSB and URA
paperwork is finished.

**To resume:** share this file with Claude and say which step you're on.
Claude will continue from the first box that is not ticked.

## How it fits together

```
User → Logto (your VPS) → CampusHomes API (your VPS) → Meta Cloud API → user's WhatsApp
```

- **Your server:** Logto, the CampusHomes API, the codes, the rate limits
  (5 codes per number every 15 minutes) and every secret. The code is already
  built: `apps/api/src/modules/auth/otp-delivery.ts`.
- **Meta:** only delivers the message. The official API cannot be
  self-hosted. Meta retired its only self-hosted version (On-Premises API).
- **Not used:** Evolution API and Baileys. They are unofficial, Meta bans
  numbers that use them, and a ban would block every phone sign-in.

Email codes (Logto + Resend) keep working the whole time. Phone sign-in stays
off until Step 6 passes.

## Progress

- [ ] Step 0: Business paperwork (URSB, URA). **← paused here**
- [ ] Step 1: Phone number + Meta Business portfolio
- [ ] Step 2: Meta developer app + WhatsApp product + connect the number
- [ ] Step 3: Business verification + display name
- [ ] Step 4: Authentication template (copy-code button) approved
- [ ] Step 5: Permanent access token (system user)
- [ ] Step 6: Server config (Dokploy env + Logto connector), staging test
- [ ] Step 7: Production switch-on

Meta renames its screens often. If a label below doesn't match what you see,
describe the screen to Claude.

---

## Step 0: Business paperwork (you)

Have these ready as clear PDFs or photos:

- [ ] URSB certificate of incorporation or business-name registration
- [ ] A document showing the **same legal name** with an address or phone
      number: utility bill, bank statement, or URA TIN certificate
- [ ] The exact legal name, written down as it appears on URSB. Every Meta
      field must match it character for character.

## Step 1: Phone number + Meta Business portfolio

**1a. Choose the CampusHomes WhatsApp number**

- [ ] A dedicated SIM (MTN or Airtel), not your personal number
- [ ] Not active on the WhatsApp or WhatsApp Business app. If it is, delete
      that WhatsApp account first (Settings → Account → Delete account).
- [ ] Can receive one SMS or voice call for verification
- [ ] Keep the SIM active long-term. Meta can ask to re-verify it.

**1b. Create the business portfolio**

1. Go to business.facebook.com and sign in with your personal Facebook
   account. It is only the admin login; users never see it.
2. Create a portfolio named with the **URSB legal name**. Use a
   `@campushomes.co.ug` email, not Gmail.
3. Settings → Business info: fill in the legal name, address, phone and the
   website `https://campushomes.co.ug`.
4. Settings → People: add a second admin you trust, so you can't be locked
   out.

**Tell Claude:** portfolio created, whether the number was ever on
WhatsApp, and that the URSB name matches.

## Step 2: Developer app + WhatsApp + the number

1. Go to developers.facebook.com, open My Apps, and choose Create app.
   - Use case: **connect with customers through WhatsApp**, or app type
     **Business**.
   - Link it to the business portfolio from Step 1.
2. Add the **WhatsApp** product. Meta gives you a free *test* number and a
   24-hour token. Ignore the token; the permanent one comes in Step 5.
3. WhatsApp → API Setup → Add phone number:
   - Display name: `CampusHomes`
   - Category: Real estate (or the closest match)
   - Verify with the SMS or voice code sent to the SIM
4. Copy these into your password manager. **Never paste them into chat or
   Git.**
   - **Phone number ID** (digits): becomes `WHATSAPP_PHONE_NUMBER_ID`
   - **WhatsApp Business Account ID** (digits): needed in Step 5
5. Add a payment method (Business settings → Billing). Meta charges for
   each authentication message. Check the current Uganda rate on Meta's
   pricing page.

## Step 3: Business verification + display name

1. Business settings → Security center → **Start verification**. Upload the
   Step 0 documents. The legal name must match URSB exactly.
2. Verification usually takes a few days. Until it is approved, the account
   can only message a small number of people per day, which is enough for
   staging.
3. WhatsApp Manager → Phone numbers: confirm the display name `CampusHomes`
   is **Approved**.

## Step 4: Authentication template

WhatsApp Manager → Message templates → Create template:

- Category: **Authentication**
- Name: `campushomes_otp` (lowercase letters, digits and `_` only). This
  becomes `WHATSAPP_AUTH_TEMPLATE_NAME`.
- Language: **English**. Set `WHATSAPP_TEMPLATE_LANGUAGE` to the code Meta
  shows for it, for example `en` or `en_US`. They must match exactly.
- Code delivery: **Copy code** button. The API fills in both the body code
  and the button code, so the template must have exactly this one button.
- Optional: the security disclaimer and an expiry line, for example "This
  code expires in 10 minutes."

Wait until its status is **Active / Approved**.

## Step 5: Permanent access token

The 24-hour test token stops working, so production needs a token that
doesn't expire.

1. Business settings → Users → **System users** → Add, with the Admin role.
2. Assign assets: your app (full control) and your **WhatsApp Business
   Account** (full control).
3. Generate a token for the app:
   - Expiry: **Never**
   - Permissions: `whatsapp_business_messaging` and
     `whatsapp_business_management`
4. Copy it straight into your password manager. Meta shows it only once.
   It becomes `WHATSAPP_ACCESS_TOKEN`.
5. Note the Graph API version shown in the API Setup screen (for example
   `v23.0`). It becomes `WHATSAPP_GRAPH_API_VERSION`. Pin that exact value.

## Step 6: Server configuration + staging test

**6a. Generate the webhook secret** on your own machine:

```bash
openssl rand -base64 48
```

That value is `LOGTO_SMS_WEBHOOK_SECRET`. Use a different one for staging and
production.

**6b. Dokploy → staging API service → Environment.** Use runtime
Environment, **not** Build-time Arguments:

```text
PHONE_OTP_CHANNEL=whatsapp
WHATSAPP_GRAPH_API_VERSION=<from Step 5>
WHATSAPP_PHONE_NUMBER_ID=<from Step 2>
WHATSAPP_ACCESS_TOKEN=<from Step 5>
WHATSAPP_AUTH_TEMPLATE_NAME=<from Step 4>
WHATSAPP_TEMPLATE_LANGUAGE=<from Step 4>
LOGTO_SMS_WEBHOOK_SECRET=<from 6a>
```

Redeploy. Then confirm the running service actually has the values, because
Dokploy UI edits don't always reach the live service (see CLAUDE.md,
2026-08-27). On the VPS:

```bash
docker service inspect <staging-api-service> --format '{{json .Spec.TaskTemplate.ContainerSpec.Env}}' | tr ',' '\n' | grep -c WHATSAPP_
```

The API refuses to start if `PHONE_OTP_CHANNEL=whatsapp` is set while any of
the other values are missing. A crash loop after deploying means one is
missing.

**6c. Logto (staging admin console) → Connectors → SMS → HTTP SMS connector**

- Endpoint: `https://<staging web host>/api/auth/logto/sms-webhook`
- Header: `Authorization: Bearer <LOGTO_SMS_WEBHOOK_SECRET>`
- Use the connector's **Test** button to send a code to your own real
  WhatsApp `+256` number.

**6d. Turn on phone sign-in in staging Logto.** Sign-in experience → add
**Phone number** as an identifier for sign-in and sign-up.

**6e. Prove every flow on staging** with a real `+256` WhatsApp number:

- [ ] Register with a phone number
- [ ] Sign in with a phone number
- [ ] Forgot password
- [ ] Six quick requests to the same number: the 6th is refused ("Please
      wait before requesting another code")

Limits to know:
- Only Ugandan `+256` numbers are accepted. Others fail on purpose.
- There is no SMS fallback. If WhatsApp delivery fails, the user sees
  "temporarily unavailable" and can use email instead.

## Step 7: Production

Repeat 6a–6e on the production API service and the production Logto, using
a **new** webhook secret. Production can only be done after Step 3
verification is approved.

## Secrets checklist

| Value | Where it lives | Rotate when |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Password manager + Dokploy env | A staff member with Meta access leaves, or after any leak |
| `LOGTO_SMS_WEBHOOK_SECRET` | Password manager + Dokploy env + Logto connector | Any leak. Update Logto and the API together, or codes stop. |
| Phone number ID, WABA ID | Password manager | Never (they're IDs, not secrets) |

Never put any of these in Git, in chat, or in screenshots.

## Related

- `docs/runbooks/auth-acceptance-and-staff-bootstrap.md` — the release gate
  for authentication
- `apps/api/src/modules/auth/otp-delivery.ts` — sends the message, with
  rate limits
- `apps/api/src/modules/auth/logto-sms-webhook.controller.ts` — the endpoint
  Logto calls
