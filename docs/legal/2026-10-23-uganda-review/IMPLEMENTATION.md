# CampusHomes legal and backend implementation requirements

Prepared 23 October 2026 · Proposed work for engineering and the policy owner

## Status

These requirements support the accompanying drafts. They are not implemented by writing this document. Preserve the existing authentication, role and object-level authorisation controls. Design changes against the current repository state and migrations; do not copy a proposed schema into production without inspecting existing tables and contracts. No production credentials are needed in this document.

## 1 Legal documents and affirmative acceptance

Store immutable document versions with a stable key, language, title, content hash, effective time, publication time, approver and archived retrievable copy. Store acceptance separately with the authenticated actor, authority or representation where relevant, exact version, transaction, timestamp and authentication context. A privacy acknowledgement is not a universal data-processing consent. Store each optional consent by purpose and version, including withdrawal, evidence and scope.

Use server-side version checks when creating a reservation or accepting an updated contract. If the accepted version is no longer the one required for that action, return a clear review-required response. Give the user the actual completed record; do not link only to an editable current page. Do not backfill a historical checkbox as if consent had occurred. Assess retention and minimisation of evidence metadata such as IP addresses rather than retaining it indefinitely.

Before submission, show the service steps, language, filing/access arrangements, full disclosed cost and an opportunity to review, correct and withdraw. Accessible policy downloads and collection notices must remain available without an account. Signed B2B fee changes require the contractual process; public terms are not an override.

## 2 Data inventory and purpose controls

Build a processing register by category, purpose, required/optional status, legal basis, source, internal owner, recipients, storage locations, countries, retention rule and deletion method. Include free-text support, search q, tenant form fields, signature images, health details, emergency contacts, staff GPS/photos, response metrics, authentication logs, provider logs and exports. The national_id_hash schema field is not proof that no raw identifier can enter a custom form.

Review landlord-editable forms and reject or route sensitive-field requests for review. Avoid mandatory medical details. Replace the broad tenant declaration with specific notices and separate lawful consent choices where needed. A blocked optional health field must not block an ordinary reservation. Provide a notice to parents and emergency contacts where applicable and do not treat the student's checkbox as the other adult's consent.

Section 9 expressly includes financial information as well as health and other special categories. Identify a section 9 condition for rent/payment records and medical data; a general section 7 contract, medical-purpose or legal-obligation ground is not automatically sufficient. Where section 9 subsection 3 paragraph b is used, record freely provided information and the data subject's consent. Employer and qualifying non-profit conditions are narrow and are not a general CampusHomes permission. Obtain counsel's assessment before activating sensitive processing.

## 3 Age and guardian controls

Implement age ascertainment before personal-data submission, with proportionate evidence and minimal retention. The proposed ordinary service threshold is 18. Do not infer age from university status or a parent contact. If a guardian-assisted service is supported, record authority, consent purpose/version, child scope and review date. Enforce the rule server-side across public forms and API routes, not only account registration. Decide a fair process for existing records and preserve mandatory rights.

## 4 Providers and international processing

Inventory actual production integrations separately from supported code: Logto hosting and any federation, Resend, WhatsApp/Meta, Africa's Talking, Backblaze, Cloudinary, Groq, Sentry, hosting/CDN, database, logs, backups, exports and maps. Record each provider's legal role, contract, region, sub-processors, access locations, onward transfers and retention/deletion terms. Do not infer all of these from an environment-variable name.

Approve the section 19 and regulation 30 transfer route before sending personal data. Demonstrate adequacy to the Office or obtain the relevant consent; where a destination is not on the Gazette list, the organisation bears the proof burden. A contract does not itself prove country adequacy; any consent route must be specific and properly presented, including the onward-transfer rule. Review the countries and sub-processors when a vendor changes them. A public provider register linked from the policy is a proposed transparency commitment, not a prescribed statutory document format.

For AI, send the minimum history and remove avoidable identifiers. Put a recipient and transfer disclosure before the first send, provide manual/contact alternatives, assess the legal basis and provider account settings, and block unsupported sensitive uses. Keep request bodies out of telemetry. Groq's [data documentation](https://console.groq.com/docs/your-data) and [privacy policy](https://groq.com/privacy-policy) are procurement inputs, not proof of this account's settings. No training or zero-retention guarantee is made in the drafts. If those assurances are required, obtain and verify the actual contract and settings.

## 5 Retention and rights requests

Approve a schedule before publishing exact periods. Record a trigger, period or justified criteria, exceptions, store list, responsible owner and deletion evidence per category. Include backups, exported files, offline IndexedDB drafts, object versions and external vendors. Separate public unpublication, account closure, relational deletion, de-identification and erasure. Retention for disputes or law is a documented limited hold, not a global forever flag.

Do not call admin deleteUser blindly to fulfil every rights request. Its cascade can remove a landlord's properties and other participants' related records. Determine legal holds and independent records first; preserve or anonymise the necessary shared evidence without unnecessary personal data. Confirm the intended authority for such deletion. Queue identity-provider and object-store cleanup with retries, status, audit and an owner for failures; a fire-and-forget identity deletion is not verified completion. Suppress erased data after backup restore.

Create an auditable privacy-request workflow with receipt time, request type, identity/authority check, deadline, assignment, decision, response, fulfilment proof and appeal route. Access decision and correction/deletion decision need seven-day handling; access has the Act's 30-day outer fulfilment period. Prevention and marketing notices have 14-day response rules. Automated-decision procedures have the Act's 21-day periods and a 14-day regulation path; counsel should resolve implementation details and engineering should meet the earliest applicable action deadline. Do not pause all statutory clocks indefinitely for an identity check. Use secure channels and redact others' data in exports. Keep regulator forms and complaint links current.

## 6 Immediate breach response and registration

Maintain a named DPO/privacy owner, duty contact, provider escalation route and incident log. Detect and contain, preserve minimal evidence and notify PDPO immediately where the statutory trigger is met. Do not wait for a 72-hour timer or complete root-cause analysis before the required initial report. Capture Form 7 information: breach nature, data, affected categories and approximate numbers, consequences, remedial steps and contact. Track regulator instructions and affected-person notifications.

Track PDPO registration purposes, roles, recipients, countries and retention; evidence of registration; changes; renewal and deadline owner. The research ledger records 12-month validity, renewal at least three months before expiry and notification of relevant changes within 14 days. Verify the current process with PDPO. Neither an appointed DPO nor an application alone proves completed registration.

## 7 Search cookies maps and offline devices

Choose whether to stop storing free-text search q or disclose and justify it. If removed, handle historical rows and logs; deleting one serializer does not clean old data. Consider allowlisted categorical metrics and short raw-event retention, subject to approved schedule. Review pathname identifiers, request logs and any linkage before describing records as anonymous.

Audit deployed cookies and requests in fresh and signed-in browsers, mobile and desktop, including identity pages, maps and error reporting. Distinguish essential cookies, preference storage, cookieless measurement and tracking. Introduce a real consent or choice control where required before optional tools load; the current OK dismissal cannot be treated as consent to a future advertising tag.

For staff inspection drafts, document IndexedDB contents, offline access, device encryption/lock, shared-device restrictions, synchronisation, cleanup, remote-loss response and sign-out behaviour. Confirm photographs do not expose occupants, documents or children unnecessarily. A local WhatsApp SVG and drag position do not make later WhatsApp communication internal to CampusHomes.

## 8 Landlord booking and payment contracts

Use server-authoritative reservation expiry and atomic inventory checks. Keep distinct enquiry, viewing request, hold, booking request, landlord confirmation, tenancy evidence and move-in states. A status label must not claim to decide whether a contract exists in law. Show terms and cost snapshots before acceptance and preserve changes with user agreement. Handle unavailable or suspended property holds with notice and appropriate release logic, preserving existing tenancy rights and communication.

For prices and fees store explicit amount, currency, period, calculation basis, recipient, tax treatment, payment timing and refund policy/version. Distinguish landlord-to-student fees from Akolet-to-landlord commission. A semester price must not be divided into a month silently. Record the landlord's lawful advance-rent agreement, deposit conditions and receipt responsibilities where applicable. An inspection label should link to date/scope and material-change handling, not imply a guaranteed 12-month safe period.

Keep PAYMENTS_ENABLED off for the current direct-payment model until a separately approved release covers payment role/licensing, provider contracts, authority to collect, segregated funds where applicable, reconciliation, idempotency, webhook authentication, reversals/refunds, receipts, disputes and revised policies. A signed addendum is necessary where the B2B agreement requires it, but is not sufficient regulatory approval. Do not use staff personal accounts.

## 9 Access controls and migration safety

Maintain object-level authorisation for messages, support reports, tenant forms, private documents, signatures, exports and privacy requests. Preserve staff permission and step-up checks, property membership expiry and revocation. A landlord may not use another property's form or data by guessing an ID. Public API DTOs must allowlist safe fields and exclude identity keys, internal notes and sensitive evidence.

Use private buckets and short-lived authorised downloads for identity documents and signatures. Inventory legacy public URLs and revoke or migrate them; protecting the URL endpoint does not revoke an existing public object. Validate purpose, ownership, content and size of uploads, record access and scrub sensitive data from errors. This review does not verify every upload defence or deployment control.

Use additive migrations for versions, consents, provider records, request queues and retention jobs where appropriate. Backfill only provenance that is known; mark unknown rather than fabricating historical consent. Test on a production-shaped copy with protected data, separate staging credentials, backups and recovery/rollback. Inspect existing tables before adding duplicates. Ship backend capabilities before UI promises, then publish matching document versions and notices. Avoid destructive retention jobs until dry-run counts, legal holds and recovery behaviour are reviewed.

## 10 Acceptance evidence required before publication

- Verify correct operator details and versions across footer, sign-in, reservation, tenant forms, landlord onboarding and downloadable copies.
- Demonstrate correction and withdrawal before an order, immutable terms snapshots, user copies and rejected stale document versions.
- Exercise access, correction, deletion, refusal and complaint paths against statutory deadlines, counterparties' privacy and legal holds.
- Verify deletion across database, Logto, object storage, caches, vendors and backups, including a simulated provider failure and restore.
- Confirm separate optional-health consent, no mandatory sensitive fields without lawful need, safe minor handling and private signatures.
- Test message, document and export access with another student, another landlord, expired custodian and unprivileged staff account.
- Inspect real deployed cookies/network, AI recipient and transfer disclosure, provider countries/contracts and telemetry redaction.
- Simulate inventory races, expired holds, withdrawal of a listing, a booking cancellation and a direct landlord payment dispute without inventing CampusHomes custody of funds.
- Run a tabletop immediate-PDPO-report exercise and verify the responsible person, form and escalation route.
- Record the approver, date, evidence and unresolved exceptions. Local source inspection alone is not production acceptance or security certification.
