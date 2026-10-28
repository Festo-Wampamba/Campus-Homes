# CampusHomes Uganda legal research and implementation report

Prepared 23 October 2026 in Africa Kampala time

## Outcome and scope

The recommended structure is a separate CampusHomes Privacy Policy and Terms and Conditions issued by the verified Akolet operating entity. The owner confirmed this structure during this task. The drafts are supplied as Markdown and editable Word documents. They are review drafts, not effective policies, executed agreements or a compliance certificate. The original landlord agreement has been preserved.

Follow-up: the owner subsequently requested these drafts on the staging website for testing. See [the staging publication record](STAGING-DEPLOYMENT.md) for the release and verification status. Publication of a review draft does not assign an effective date or approve the outstanding legal and operational decisions.

The principal conclusion is that longer legal pages alone will not resolve the gaps. Privacy notices must match the actual collection paths, international providers and deletion behaviour. The reservation, landlord confirmation, tenancy and direct-payment states need consistent contractual and interface descriptions. Several decisions require owner evidence and Ugandan counsel before publication; these are listed below with implementation work rather than hidden in final-sounding clauses.

This review covers the current CampusHomes accommodation platform and its data flows, not every Akolet business, employment relationship, telecommunications service or possible future payment product. The earlier frontend-to-backend session handoff remains a separate pending deliverable; this research does not claim that report was completed. This task changed documentation only and did not deploy legal text or infrastructure.

## Deliverables

- [Privacy Policy draft](CampusHomes-Privacy-Policy-DRAFT.md) and [Word copy](CampusHomes-Privacy-Policy-DRAFT.docx).
- [Terms and Conditions draft](CampusHomes-Terms-and-Conditions-DRAFT.md) and [Word copy](CampusHomes-Terms-and-Conditions-DRAFT.docx).
- [Landlord agreement review](landlord-agreement-review.md), containing clause references, quotations from the supplied draft, replacement language and factual questions.
- [Privacy research ledger](privacy-research.md), containing section and regulation references and source limitations.
- [Backend and publication requirements](IMPLEMENTATION.md), for the engineers and policy owner who must support the notices.
- [Source and file manifest](SOURCE-MANIFEST.md), including the four downloaded laws, supplied agreement, company overview, local code evidence and external research links.

## How the research was conducted

The Ministry of ICT index was opened and its four listed Acts screened. The downloaded copies were read or extracted; the privacy scan was cross-checked against the official NITA-U text. The separate ICT policies-and-regulations index was inspected and the Electronic Transactions Regulations 2013 were read. Privacy regulations, PDPO materials, tenancy legislation, contractual capacity, electronic records, payment-system boundaries and relevant legal-status developments were researched through official sources and searchable law or judgment reproductions. The RentEase article was treated as a secondary explanation and checked against the Act, rather than used as the governing law.

The supplied landlord DOCX and company overview were extracted without altering their originals. Selected current source files were read to test the public claims against the product. Repository snapshot at the focused inspection was HEAD 2bf8241c86d86c31a7d6f70435b283c87bb77724 with existing worktree changes; this is not a whole-system security audit or production configuration inspection. Supported integration code is not evidence that the provider is live.

Some websites returned timeouts, JavaScript shells or access restrictions. The source ledger distinguishes official scans, official text, searchable consolidations and search-index evidence. No claim is made that every Gazette instrument or case through this date was independently located. Before publication, counsel should confirm the current statute book, commencement and applicable amendments or directions, especially the cybercrime changes, consumer-law developments, agent rules and transaction-specific exclusions.

## Relevant Ugandan framework

### Privacy and constitutional foundation

The [Constitution](https://www.parliament.go.ug/page/constitution), including privacy in article 27 and equality principles in article 21, provides the background. The operative platform privacy framework is the [Data Protection and Privacy Act 2019](https://ict.go.ug/site/documents/Data-Protection-and-Privacy-Act-2019.pdf), also available as [Cap 97 from NITA-U](https://nita.go.ug/sites/default/files/2026-09/Data%20Protection%20and%20Privacy%20Act%20cap%2097.pdf), and [Regulations 2021 SI 21](https://oldsite.nita.go.ug/sites/default/files/2022-11/Data_Protection_and_Privacy_Regulations-2021.pdf). The detailed privacy ledger explains the mapping.

The Act addresses lawful collection, defined purposes, a notice before collection, proportionality, accuracy, retention, security, processors, international processing and rights. A single footer link does not replace a notice on a sensitive tenant form. Consent needs to be specific and informed where relied on; contractual acceptance and privacy acknowledgement must not be used as universal consents. Section 9 covers financial information as well as health and other special categories; a general section 7 contractual basis does not by itself settle that additional condition. For child data, age ascertainment and the appropriate guardian consent or statutory exception are required. The draft's proposed 18-plus ordinary service rule is a product decision supported by the ordinary capacity baseline, not an assertion that all under-18 contracts are invalid. The [Contracts Act section 10](https://ulii.org/akn/ug/act/2010/7/~part_IV__sec_28) contains an exception; the [Children Act source trail](https://ulii.org/en/akn/ug/act/statute/1996/6/eng%402024-08-16) and Constitution also require consideration.

Registration and designation of a data protection officer require attention. Do not claim that Akolet is PDPO registered without its certificate, registration particulars and renewal evidence. The privacy ledger records the relevant registration, change-notification and renewal provisions.

### Electronic commerce and contract evidence

The [Electronic Transactions Act 2011](https://ict.go.ug/site/documents/UGANDA-Electronic-Transactions-Act-No.-8-of-2011.pdf) is relevant even where a student reservation is free. Section 24 requires supplier and transaction information and the chance to review, correct and withdraw before an order. Required particulars include legal identity and status, address, contact information, company registration, directors and place of registration where applicable, service description, full price and fees, payment, accessible terms, delivery, record access, refunds and privacy/security information. Sections 25–28 address cancellation, unsolicited communications, performance and preservation of consumer rights. A label saying marketplace or no payment does not justify disregarding the applicable duties.

The [Electronic Transactions Regulations 2013 SI 42](https://ict.go.ug/public/site/documents/Electronic-Transction-Regulations-SI-42-of-2013.pdf), particularly regulations 9–12, add accessible service-provider information, clear commercial communications, contract steps, error correction, filing/access information, language and reproducible terms. Regulations 3–7 also matter for evidence integrity. Engineering must preserve the actual accepted version and completed transaction record.

The [Electronic Signatures Act 2011](https://ict.go.ug/site/documents/UGANDA-Electronic-Signatures-Act-No.-7-of-2011.pdf), especially its reliability conditions, complements the Transactions Act. A pasted signature image or generic click is not automatically an advanced or secure signature. Authentication, authority, intent, document integrity and retained evidence matter. Transactions Act section 3 and Schedule 2 exclude certain instruments, including documents creating or transferring a property interest requiring registration to be effective against third parties. Do not infer that every tenancy is excluded or every electronic tenancy is valid. Check the actual instrument and Landlord and Tenant Act requirements.

The [Contracts Act 2010](https://ulii.org/akn/ug/act/2010/7/~part_IV__sec_28), especially sections 9–12, supplies contract formation, capacity, writing and free-consent rules. Its writing threshold is above 25 currency points, while the tenancy Act has its own enforceability rule at 25 points or more; these are not interchangeable thresholds. Indemnities and guarantees also need the applicable writing treatment.

### Accommodation and landlord relationships

The [Landlord and Tenant Act 2022 Act 9](https://bills.parliament.ug/attachments/The%20Landlord%20and%20Tenant%20Act%2C%202022.pdf), with a [searchable consolidation](https://ulii.org/en/akn/ug/act/2022/9/eng%402023-12-31), governs covered landlord–tenant relationships. Its scope and exclusions need classification per property. An ordinary student hostel is not automatically outside the Act simply because a university is nearby.

Material controls include party identification and copies, habitability and repairs, receipts, rent and deposit rules, quiet enjoyment, non-discrimination, notices and lawful termination. A platform suspension is not an eviction. Semester rent needs a clearly agreed payment period and any agreement necessary under the advance-rent rule. Landlord extra charges and platform commission need distinct recipients and bases. The agreement review examines sections 3–5, 19–30, 34–49 and the possible limited-agent scope under section 49. Avoid using the Act's annual rent-increase default as authority for a booking commission.

The [RentEase guide](https://www.renteaseuganda.com/blog/uganda-landlord-tenant-act-2022-guide) is useful for orientation but does not settle statutory scope, remedies, exceptions or the legal character of Akolet's conduct. No automated eviction or legal-notice workflow should be designed from a blog summary.

### Cybercrime current status and intellectual property

The downloaded [Computer Misuse Act 2011](https://ict.go.ug/site/documents/UGANDA-Computer-Misuse-Act-No.-2-of-2011-1.pdf) is not a sufficient current-law source by itself. The indexed judgment [Alternative Digitalk and others v Attorney General 2026 UGCC 3](https://ulii.org/en/akn/ug/judgment/ugcc/2026/3/eng%402026-03-17) records a constitutional ruling on the 2022 amendment and specified provisions. A [government broadcaster report](https://ubc.go.ug/2026/03/26/govt-drops-appeal-on-computer-misuse-act-ruling-opts-to-return-law-to-parliament/) reports the Attorney General's response. The full judgment was access-restricted through the browsing tool during this review; counsel should confirm its orders and later treatment. Do not declare all of the Act repealed, import struck-down speech offences into house rules or attach unverified criminal penalties to user conduct. The terms use contractual prohibitions on fraud, unauthorised access, harassment and system abuse without asserting obsolete offence numbers.

Copyright remains relevant to listing images, student reviews, screenshots, videos, branding and generated media. The [ULII current record](https://ulii.org/en/akn/ug/act/2006/19/eng%402026-05-22) identifies a 2026 amendment to the Copyright and Neighbouring Rights Act. Use a narrow service-related content licence and a rights-reporting process, not a claim that uploading transfers ownership or authorises public use of private records. Verify current exceptions before applying broad extraction or reverse-engineering restrictions.

### Payments and other conditional obligations

The [Bank of Uganda payments framework](https://bou.or.ug/financial_infrastructure_innovation) and [licensing FAQ](https://bou.or.ug/uploads/Frequently_asked_Questions_on_the_NPS_ACT_2020_and_the_NPS_Regulations_2021_5818aec7f5.pdf) make payment activity a separate assessment. Current direct landlord payment should not be silently changed by enabling a feature flag or using a provider key. Holding, settling, aggregating or refunding funds can change the relevant contractual, regulatory and privacy responsibilities. Integration with a licensed provider does not by itself prove that Akolet's own role is exempt from authorisation.

Tax records, invoices, company particulars, local accommodation permissions, accessibility, public health and fire or building standards require review according to actual services and properties. This task does not certify each hostel, tax treatment or professional licence. National ICT, BPO, communications and cybersecurity policy documents provide context; they are not automatically private website contract clauses or a complete list of enforceable duties. Government e-filing, electronic-signature certification-authority operations, telecom-network licensing, trust/will instruments and financial-sector rules are outside the present service unless Akolet undertakes those activities. Reassess them when scope changes.

No comprehensive Consumer Protection Act is asserted here. Official [Trade Ministry material](https://www.mtic.go.ug/uganda-partners-with-comesa-to-fast-track-implementation-of-the-competition-and-consumer-protection-laws/) describes legislation under development and [2026 Parliament material](https://cmis.parliament.go.ug/cmis/views/49d72657-45dd-4428-9726-5745dd242880%253B1.0) mentions the Bill. Recheck enactment and commencement at publication; meanwhile preserve concrete rights under existing applicable laws.

## Cancellation interpretation requiring particular care

The ICT copy places the dated-accommodation exception in section 24 subsection 7, referring to subsection 3. Section 25 separately sets out a seven-day cancellation provision and related refund wording. It is unsafe to assume the accommodation exception extinguishes every right in section 25, and unsafe to promise an unconditional seven-day cancellation of every tenancy without analysing the transaction and applicable legislation. The drafts preserve mandatory rights and require disclosure of lawful transaction-specific terms. Obtain a Ugandan opinion before a paid booking or cancellation engine is activated. A landlord's cancellation policy cannot displace mandatory law.

## What was adopted from the reference platform

[DigsConnect Privacy](https://www.digsconnect.com/privacy) was used to check coverage of operator identity, data categories, purposes, recipients, cookies, transfers, retention and rights. Its South African POPIA and GDPR framing, named partners and business-specific data uses are not evidence of Akolet's duties or practices. We did not copy its wording or assume that foreign-law obligations apply merely because the platform is accessible internationally. Assess foreign targeting or operations separately if they arise.

[DigsConnect Terms](https://www.digsconnect.com/terms-and-conditions) was used to check service definitions, booking, cancellation, content, risk and additional-service coverage. CampusHomes uses its own direct-payment and free-hold model. Its drafts do not adopt DigsConnect subscription products, commission structure, broad risk transfers or an acceptance-by-use clause as a replacement for clear transaction acceptance.

## Verified product issues and policy consequences

| Finding from source review | Consequence |
| --- | --- |
| The existing privacy page says usage records never contain search text; backend search paths write q into product_events | Correct the statement or remove and safely clean up the field. Do not call it anonymous merely because actor_id is null. |
| AI requests transmit questions and recent history to Groq | Identify this recipient, explain the transfer before submission and assess contract, country, retention and secondary-use controls. |
| Tenant forms include optional medical details and other third-party contacts | Add specific notices, lawful basis, optional consent where required, minimisation and restricted access. National ID/passport is optional in the default template, not required. |
| Admin deletion can hard-delete a broad relational footprint and trigger a best-effort Logto deletion | Build a rights process around the actual path. Validate lawful holds, counterparties' records, storage objects, retryable identity deletion and backups before a complete-erasure claim. |
| Storage code accepts legacy document URLs and code supports public photos and private documents | Inventory and migrate sensitive legacy objects; do not equate access-checking an API with making an already-public URL private. |
| New public features show landlord join dates and response summaries | Explain public profile data, sample/window definitions and correction routes; do not publish a fabricated response guarantee. |
| An essential-only notice exists, while sign-in, maps and optional providers have independent data flows | Perform a real deployed cookie/network inventory; distinguish cookies from personal-data processing. |
| Offline inspection drafts contain photographs, notes and GPS in IndexedDB | Add device controls, purpose notice, cleanup and sign-out behaviour; this is not only a theme preference. |
| Signed tenant forms can be created from landlord-editable fields | Moderate field categories, preserve the agreed version and identify who controls tenant administration. A form named agreement is not automatically a complete enforceable tenancy. |

These are source-backed discrepancies and control requirements, not proof that a particular live record was exposed or a legal violation occurred.

## Decisions and evidence required from Akolet

1. Verify the legal operator name and URSB number. Reconcile the old Ntinda company-overview address with Maimood shared contact details; provide registered and legal-service addresses and required corporate particulars.
2. Designate the privacy lead and DPO as applicable, confirm monitored contacts and obtain PDPO registration and renewal evidence. No registration claim or number has been invented.
3. Approve the adult-only ordinary account rule or define a legally reviewed guardian service. Decide how to handle existing underage users without unnecessary collection or automatic loss of records.
4. Confirm whether Akolet acts as a limited agent and what staff actually do. Approve service scope and document hierarchy across public terms, B2B landlord agreement and tenancy documents.
5. Approve each paid service and fee basis, or state no current charges. Clarify landlord-to-student charges separately from Akolet commission, especially semester calculations and refunds.
6. Supply the actual provider and country register, deployment roles, contracts, retention settings and onward-transfer information. Name a lawful transfer route per flow; the generic statement protected by contracts is insufficient.
7. Approve a defensible retention schedule and lawful-hold rules for every meaningful category. Do not insert arbitrary six-year or 30-day periods as if mandated for all data.
8. Decide whether health fields should exist at all. If retained, approve their purpose, access group, separate consent and deletion rule; assess alternatives with less sensitive data.
9. Approve complaint staffing and the proposed service targets. Statutory rights and immediate breach duties cannot be deferred until those targets are convenient.
10. Obtain Ugandan counsel confirmation on consumer cancellation, tenancy scope, agency, property restrictions, electronic signatures and current amendments. A revised footer is not a substitute for these operational decisions.

## Publication and infrastructure sequence

Complete the evidence and decisions, implement the requirements in IMPLEMENTATION.md, test them with realistic accounts and records, and have the owner and counsel approve the final wording. Then replace the draft metadata with an effective date, version and approver, publish retrievable copies, add transaction acceptance records and collection notices, and archive earlier versions. Do not backdate acceptance or apply a new fee to an existing signed agreement through a website update.

Before release, inspect the deployed network/cookies and real provider settings, complete the privacy request and breach exercises, and verify data retention/deletion across all stores. The current task verifies the research and document package; it does not assert production acceptance or a vulnerability-free system.
