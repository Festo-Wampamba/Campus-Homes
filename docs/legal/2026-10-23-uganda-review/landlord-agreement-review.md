# CampusHomes Landlord Agreement Proposed V2: Uganda and product-model review

Review date: 23 October 2026  
Status: pre-signature review; this report is an issue list and drafting aid, not an advocate's opinion.

## Scope and materials

The original file was read only as a DOCX ZIP/XML package. It was not edited or rewritten. Source file: [CampusHomes_Landlord_Agreement_Proposed. V2.docx](</home/festo/Downloads/CampusHomes_Landlord_Agreement_Proposed. V2.docx>). SHA-256: b92e9f935d30af14468f373dfc32f480f6d774d1b5a7447fed023a64b4107da1.

The model comparison uses the current repository materials:

- [Reserve flow](</home/festo/Campus-Homes/apps/web/src/components/reserve-button.tsx>) says “Reserve for free”, takes no payment, holds an available bed temporarily, tells the student to agree terms with the landlord, and says the landlord confirms the booking and is paid directly.
- [Public terms](</home/festo/Campus-Homes/apps/web/src/app/(public)/terms/page.tsx>) say a reservation is not a tenancy, the landlord confirms the booking and collects rent directly, and CampusHomes is not a party to the tenancy.
- [Listing experience](</home/festo/Campus-Homes/apps/web/src/components/listing/listing-experience.tsx>) describes an inspection visit with conditions capable of changing, displays semester rent, and displays a separate landlord booking-fee percentage when one is stated.
- [Landlord booking confirmation](</home/festo/Campus-Homes/apps/web/src/components/landlord/confirm-booking-dialog.tsx>) records what the landlord collected from the student in person or by mobile money.
- [Student-landlord messaging](</home/festo/Campus-Homes/apps/api/src/modules/chat/chat.service.ts>) permits eligible students and verified landlords to communicate about enquiries or reservations.
- [Akolet company overview](</home/festo/Downloads/WhatSie/Akolet Company Overview.docx>) states URSB registration number 80034439190764 and an older TechBuzz Hub/Ntinda address, and describes future/current capabilities as student “book and pay” and automated rent collection. It is a company overview, not independent registration evidence; its address and payment claims do not match the proposed agreement header and the current direct-payment flow.

## Disposition

Do not use this as the signature-ready template until the parties fill and verify the operator and notice details, define the reservation/booking/tenancy states, choose and disclose the actual agency scope, separate any CampusHomes-to-landlord commission from a landlord-to-student booking fee, and add the statutory tenancy-information and receipt controls below. The draft already has useful guardrails: direct rent/deposit payment, no authority for CampusHomes to sign or collect rent, inspection limits, suspension without eviction, and a written-fee-row requirement.

## Legal baseline and status limits

The primary text reviewed was the [ULII Landlord and Tenant Act, 2022, Chapter 238](https://ulii.org/en/akn/ug/act/2022/9/eng%402023-12-31) and its [ULII PDF copy](https://media.ulii.org/media/legislation/122651/source_file/6cb1b80d316d5252/2022-9.pdf), cross-checked against the [Parliament of Uganda Acts 2022 index](https://www.parliament.go.ug/acts/acts-2022) and the [Parliament PDF link](https://bills.parliament.ug/attachments/The%20Landlord%20and%20Tenant%20Act%2C%202022.pdf). The ULII record identifies Act 9/2022, assented to on 12 April 2022 and commenced on 17 June 2022. Its displayed consolidated version is dated 31 December 2023 and warns that updates may exist; the PDF also says the collection was last checked for updates on 31 December 2000. That is not confirmation that no amendment, regulation, or relevant case exists by this review date. Uganda counsel should check the current ULRC statute book, Gazette, regulations, and case law before signature. The [RentEase guide](https://www.renteaseuganda.com/blog/uganda-landlord-tenant-act-2022-guide) was reviewed only as the supplied secondary lead; the Act controls.

Clause 12 was also checked against the [ULII Electronic Transactions Act, 2011](https://ulii.org/en/akn/ug/act/2011/8/eng%402023-12-31), especially sections 3, 5–8, and Schedule 2, and the [ICT Ministry copy](https://ict.go.ug/site/documents/UGANDA-Electronic-Transactions-Act-No.-8-of-2011.pdf). That Act gives electronic records/signatures legal routes subject to its conditions, but Schedule 2 excludes certain documents creating or transferring a property interest that require registration against third parties. That is why the agreement should not make an unqualified promise that every click or every electronic tenancy has the same effect as handwriting.

Provisions material to this form are:

- Sections 1(1), 1(3), and 2: residential/business scope, exemptions for institutional/incidental residence, transient lodging, and employment housing, and the definitions of landlord, authorised agent, rent, tenancy, and tenancy agreement.
- Sections 3–5: tenancy agreements may be written, oral, implied, or data messages; identification is required before a landlord enters a tenancy; an agreement of 25 currency points or more is not enforceable by action unless written/data-message or admitted; and the landlord must give the tenant a copy immediately after signing. Schedule 1 sets one currency point at UGX 20,000, making 25 points UGX 500,000.
- Sections 6–11, 19–20: fitness for habitation, repair, quiet enjoyment, anti-discrimination, and the rule that terms purporting to exclude/restrict/modify the Act are void in a tenancy.
- Sections 21–30: rent/payment records and receipts, advance rent, rent increases, and security-deposit cap, written conditions, and receipt. Section 26(1) states a 10% annual rent-increase default unless the tenancy agreement otherwise agrees; it is not a general service-fee or booking-fee cap.
- Sections 34, 38, 43, 45, and 48: lawful termination, statutory residential notice minimums, re-entry/eviction controls, unlawful-eviction relief, and 20-hour entry notice.
- Sections 46 and 49: landlord extra-service fees and written agent particulars/scope made available to the other party. Section 49 lists marketing, drawing up tenancy agreements, rent collection, repairs, and common-area management as possible agent transactions.

## Findings and proposed drafting

### 1. Operator identity and notices — high priority

Existing wording:

> “Akolet Properties Ltd operates CampusHomes.”

Clause 1 leaves the company registration number and CampusHomes notice email/telephone blank. The signature line is “For Akolet Properties Ltd operating CampusHomes”; the header also includes “Maimood Hostel, Office J07 Kampala, Uganda”. A separate company overview states URSB number 80034439190764 and a TechBuzz Hub/Ntinda address, but that overview is not a registry extract and does not resolve the address conflict. The draft does not identify a registered office, verified registration evidence, or the capacity of the Akolet signatory.

Risk: the contracting party, service-of-notice address, invoice recipient, and person with authority to bind the operator are unclear. The Act's definition of landlord includes a duly authorised agent (section 2), and section 3(5)(b) requires a legal person entering a tenancy to provide registration details. This B2B form is not itself the student tenancy, but the same identity gap undermines any later platform agency or tenancy record.

Suggested replacement, subject to verified facts:

> “CampusHomes is a platform operated by [full verified legal name], URSB registration number [ ], registered office [ ], notice email [ ], and telephone [ ]. ‘CampusHomes’ is the platform/trading name and does not change the contracting party. Each signatory warrants authority to bind the named party. The operator's registration extract and signatory authority are attached.”

Fill the landlord's legal name, authority, address, notice contacts, and representative before any signature. Verify any URSB number and address against current company records. If Akolet is not the actual operating entity, replace the name rather than relying on the header. The company overview's “book and pay” and automated-rent-collection language should be marked as roadmap or corrected so it does not contradict the direct-payment agreement and current product.

### 2. Reservation, booking, and tenancy are not separated — high priority

Existing wording in clause 6:

> “An enquiry is not a confirmed booking.”

The agreement then says the landlord and student enter their own tenancy agreement, but it never defines the free reservation/temporary hold, booking request, landlord confirmation, or the point at which a tenancy is formed. The current product uses a free reservation before a student requests booking; landlord confirmation changes the platform status, while rent is agreed and paid directly.

Risk: a “booking” could be read as a tenancy, as a paid event, or as the commission trigger. That creates avoidable disputes over availability, cancellation, refunds, fees, and whether CampusHomes guaranteed a room.

Suggested replacement:

> “‘Enquiry’ means a question or viewing request. ‘Reservation’ means a free, temporary CampusHomes hold of an available bed for the displayed period; it is not a tenancy, rent payment, deposit, or guarantee, and it expires if not confirmed before the displayed expiry. ‘Booking request’ means the student's request to the landlord after viewing/agreeing the relevant terms. ‘Confirmed booking’ means the landlord's recorded acceptance in CampusHomes; that platform label does not itself determine whether the parties have also formed a binding tenancy under their actual communications and applicable law, and it is not a guarantee by CampusHomes of continuing suitability. The landlord and student must enter and receive their own tenancy agreement in the form and manner required by law.”

Keep the current rule that a landlord cannot substitute a room or add a charge without the student's agreement. State that no CampusHomes payment is taken for the reservation.

### 3. Agency scope is unclear — high priority

Existing wording in clauses 3 and 6 says CampusHomes supports “student enquiries, viewing arrangements and booking communication”, while also saying it is not the landlord or property manager and has no authority to sign a tenancy, change rent, or receive rent/deposits.

Risk: those services may amount to limited marketing or communications agency on the facts. Section 49 permits an agent to market, draw up tenancy agreements, collect rent, arrange repairs, or manage common areas, but requires the particulars and scope of appointment to be in writing and made available to the other party. A disclaimer does not determine the legal character of conduct. The draft should not accidentally give CampusHomes authority that it does not intend, or hide an agency role from a student.

Suggested replacement, subject to counsel's classification:

> “CampusHomes is appointed only as [a limited marketing and communications agent / an independent platform service provider]. Its scope is publishing approved listing information, routing enquiries, coordinating requested viewings, transmitting agreed booking information, and recording the landlord's booking status. It has no authority to sign or vary a tenancy, set or change rent, collect rent, deposits or landlord charges, arrange repairs, manage common areas, or evict a tenant. Any wider appointment requires a separate signed document and disclosure to the affected student.”

If CampusHomes is an agent for section 49 purposes, name it as such, attach the scope, and obtain Ugandan advice on any licensing/regulatory requirements under section 51(1)(c). If it is not, describe the service consistently as technical/intermediary support and avoid staff conduct that looks like negotiation or collection.

### 4. Statutory tenancy information needs an operational promise — high priority

Existing wording in clauses 4 and 6 requires lawful authority and says the landlord will comply with the Act, “including applicable rules on deposits, receipts, advance rent, access, notices and eviction”.

Risk: the general promise is useful but does not say who supplies the information that a student needs before confirmation or who gives the statutory copy. The Act requires identification before a landlord enters a tenancy (section 3(5)), a written/data-message enforceability path at 25 currency points or more (section 4), and a copy immediately after signing (section 5). It also supplies non-waivable residential protections and payment/deposit rules. Any template or workflow that lets a landlord confirm a booking without a complete term sheet can leave the student unable to assess the real cost.

Suggested replacement:

> “Before the student accepts a booking or tenancy, the Landlord will provide a complete written or data-message term sheet stating the legal parties, exact room/bed or allocation method, tenancy period, rent amount and period, utilities and optional charges, any deposit and its written deduction conditions, any advance rent and payment timing, any landlord booking/service fee and refund rule, house rules, cancellation/termination terms, and payment channel. Before entering the tenancy the Landlord will obtain the identification required by section 3(5), give the signed tenancy agreement or statutory record to the student as required by sections 3–5, issue rent and deposit receipts as required by sections 21, 25 and 30, and not contract out of the Act.”

The landlord remains responsible for fitness/repair (sections 6–9), taxes/rates (section 10), and quiet enjoyment (section 19). This clause should point to a real tenancy document or checklist, not just the B2B agreement.

### 5. Inspection language should match the actual visit and badge — high priority

Existing wording in clause 5 makes “Property visit” an optional agreed check, then says CampusHomes will record what was checked and that verification “is not a structural survey, title certification or a guarantee of safety, occupancy, rent payment or tenant conduct”. Verification is stated to last 12 months or until major structural change.

The public product presents every published hostel as physically inspected, shows the inspection date, says conditions can change, and tells the student to view before paying. That is narrower and more concrete than an optional checkbox or an undefined “verification label”.

Risk: the contract and public badge could describe different scopes. A student could reasonably read “verified” as a current safety/title/availability certification even though the contract disclaims that. A 12-month label without a displayed visit date or change-reporting trigger also creates stale-listing risk.

Suggested replacement:

> “A property visit is an observational visit by CampusHomes on the recorded date, limited to the rooms, facilities, documents, and representations made available for that visit. The record will distinguish landlord-supplied information from conditions observed. A visit is not a structural survey, title or letting-authority certification, public-health approval, safety guarantee, occupancy guarantee, rent-payment guarantee, or guarantee of future condition or tenant conduct. CampusHomes may display an inspection/visit badge only when a recorded visit exists and will show the visit date and scope. The Landlord must report material changes, hazards, closure, availability changes, or authority changes promptly; CampusHomes may suspend or require reinspection.”

This preserves the intended inspection safeguard while describing a visit, not a guarantee. Decide whether 12 months remains appropriate after counsel and operations confirm the reinspection process.

### 6. Commission, landlord booking fee, and any “10%” must be separated — high priority

Existing clause 7 contains a blank row:

> “Commission — For Successful booking — None or ______ % of first month's rent. Cap UGX ____________”

It says a completed row must be agreed and initialled, and that commission is earned when a student introduced through a recorded CampusHomes enquiry moves in and pays the first month's rent. The DOCX contains no filled-in 10% figure.

The product has a separate landlord-facing booking-fee field displayed to students as a percentage of semester rent, and the landlord confirmation UI records a booking fee collected directly from the student. This is not evidence that a landlord booking fee is the same as a CampusHomes B2B commission. The product also uses semester rent, so “first month's rent” may be the wrong commission base.

Risk: a blank B2B row can be confused with a tenant-facing fee, and “completion of booking by tenant” is not the same objective event as landlord confirmation, move-in, or direct payment. If a fee is stated elsewhere as 10%, the document does not say whether it is landlord-to-student or landlord-to-CampusHomes, what it is calculated on, who receives it, or how it is refunded. Section 26(1)'s 10% figure concerns an annual rent-increase default (subject to the tenancy agreement); it does not validate a 10% booking fee or commission.

Suggested replacement:

> “Landlord service fees payable to CampusHomes are set only in a completed and initialled row stating the fixed UGX amount or percentage, the precise base (for example, the first confirmed tenancy period rather than an assumed calendar month), cap, tax treatment, invoice date, and due date. The fee is payable by the Landlord only and is not deducted from rent, deposit, or any landlord-to-student fee. A student enquiry or free reservation carries no CampusHomes charge. Any landlord booking/service fee charged to a student is a separate landlord-to-student charge: its amount, basis, recipient, payment timing, and cancellation/refund rule must be disclosed before confirmation and must not be represented as a CampusHomes commission.”

Also replace “moves in and pays the first month's rent” with an objective trigger suited to direct/offline payment, such as a recorded landlord confirmation of move-in plus the agreed evidence/reporting event. Ask counsel to confirm tax, invoice, lead-attribution, and consumer-law treatment.

### 7. Direct payment and refunds need statutory receipt details — high priority

Existing clause 8 correctly says rent and deposits are paid directly to the Landlord, who issues receipts and handles tenancy refunds; it bars staff from using personal accounts and requires a separate addendum for a future licensed payment provider.

Risk: it does not state the receipt timing/content, deposit conditions, advance-rent rule, or the landlord's account information where section 21(4) applies. The clause also says the Landlord must remedy or refund an unavailable/misdescribed room, although CampusHomes has no custody of the direct payment. “Lawful policy” is too vague for a cancellation/refund promise.

Suggested replacement:

> “CampusHomes does not take payment for a reservation and does not receive, hold, settle, or refund rent, deposits, or landlord booking/service fees. The Landlord receives those amounts directly, gives the written rent receipt required by sections 21 and 25 and the written deposit receipt required by section 30, states the amount and period covered, and follows the statutory deposit and advance-rent rules. Where section 21(4) applies, the Landlord will provide the required landlord bank-account number. Any refund of a direct landlord payment is the Landlord's responsibility under the disclosed terms and applicable law; CampusHomes can refund only a refundable CampusHomes charge or reverse an unearned CampusHomes commission.”

Before booking confirmation, attach or link the actual cancellation/refund policy. Do not let a direct landlord payment be described as a CampusHomes-backed refund.

### 8. Messaging and identity-data terms are too general — medium priority

Existing clause 9 contains a broad Data Protection and Privacy Act 2019 promise, a privacy notice promise, access/security/reporting language, and a separate lawful basis for unrelated marketing. Clauses 3 and 6 do not explain the stored student-landlord messages.

Risk: the live model stores and routes messages between students and verified landlords. The agreement does not state the permitted purpose, who may access messages, retention/deletion, processor use, breach handling, or whether the landlord may use a student's contact details outside the enquiry/tenancy. It also does not allocate responsibility if CampusHomes facilitates the statutory identification step.

Suggested replacement:

> “CampusHomes may receive, store, route, and display enquiry, viewing, reservation, booking, support, and safety messages to the relevant student, Landlord, and authorised support/safety personnel for operating the service. Each party will use the data only for that enquiry or tenancy and lawful safety/administration, will not scrape or use it for unrelated marketing without a lawful basis, and will comply with the Data Protection and Privacy Act 2019. The privacy notice and data schedule will identify controller/processor roles, service providers, retention/deletion, access and correction, complaints, and breach response. The Landlord remains responsible for lawful identity checks and tenancy records; CampusHomes will not publish identity documents.”

Counsel should align this with the actual privacy notice, message moderation, cloud processors, and any off-platform WhatsApp/telephone workflow. If Akolet-issued CampusHomes terms, privacy notices, payment-channel instructions, or safety policies are intended to bind this B2B agreement, identify each document by title/version/effective date, attach or link a retrievable copy, and state which document prevails in a conflict. This matters because clause 11 says website updates do not amend the agreement while public policies may be updated separately.

### 9. Suspension/termination must not be confused with eviction — medium priority

Existing clause 10 allows 14 days' service termination, seven days to remedy a remediable breach, immediate listing suspension for serious concerns, and says existing tenancies/confirmed bookings continue and “This does not evict a student.”

This is directionally correct. The remaining ambiguity is that “confirmed booking” is undefined and could be mistaken for a tenancy. Platform suspension must not tell a student to leave, cancel a tenancy, or remove the only communication route for an existing tenant. Sections 34, 38, 43, and 45 govern termination/re-entry/eviction; section 48 governs landlord entry.

Suggested replacement:

> “Ending or suspending this service does not by itself terminate a tenancy or override rights already created between the landlord and student. A temporary reservation may expire or be released under its disclosed rules, including a necessary safety or inventory withdrawal, with notice and an appropriate next step. A tenancy may end only under the landlord-tenant agreement and applicable law; CampusHomes will not evict, compel vacation, or authorise entry. The Landlord remains responsible for statutory notices, re-entry, repairs, receipts, refunds, and student contact. If service access is suspended, the parties will preserve a lawful contact route for existing tenants and confirmed bookings.”

Add a process for notifying a student when a listing is suspended and for handling a still-active free reservation before expiry.

### 10. Gender-restricted inventory needs a legal decision — medium priority, not a finding of illegality

Clause 4 says the Landlord will treat students fairly and avoid unlawful discrimination. The product has male-only, female-only, and mixed listing values and a gender filter. Section 20 prohibits refusing to rent on listed grounds including sex, ethnic origin, tribe, creed/religion, social/economic standing, political opinion, and disability.

Risk: a gender-restricted hostel may be lawful in a particular factual setting or may create a section 20 issue; the Act text alone does not resolve every housing-context exception. The contract currently has no representation, evidence, review, or disclosure rule for the restriction.

Suggested replacement:

> “The Landlord will state any occupancy or eligibility restriction accurately, apply it consistently, and provide the factual/legal basis requested by CampusHomes. CampusHomes may publish the restriction only after legal review where required and will not describe a platform label as government approval. Nothing in this agreement authorises discrimination prohibited by section 20.”

Have Ugandan counsel decide the policy before using male-only/female-only filters or refusing a student.

### 11. Electronic acceptance needs an audit trail and should not overclaim — medium priority

Clause 12 says electronic signatures and portal clicking “shall have the same legal effect as handwritten signatures” under the Electronic Transactions Act 2011.

The Landlord and Tenant Act recognises a tenancy data message in section 3(1)(d) and uses writing/data-message language in section 4, but that does not remove the need to identify the actual parties, authority, version, and copy. Under the Electronic Transactions Act, section 3 makes Schedule 2 exclusions material, sections 5–7 set conditions for electronic records/signatures, and section 8 puts authenticity/evidential weight on the record and system. A click by an unverified account should not cure the blank operator fields or create a bilateral tenancy on its own. Whether a particular tenancy creates a registrable property interest is fact-specific; do not assume that all e-tenancies fall inside or outside the Schedule 2 exclusion.

Suggested replacement:

> “The parties may sign electronically or accept through an authenticated CampusHomes workflow where permitted by applicable law. CampusHomes will retain the accepted version, party identity/authentication, timestamp, consent, and audit record and provide a complete copy. For a student tenancy, the Landlord and student remain responsible for satisfying sections 3–5 and any other mandatory requirements; platform acceptance alone does not make CampusHomes a tenancy party.”

Counsel should verify the Electronic Transactions Act 2011 wording, Schedule 2/property-registration question, and the portal's authentication/audit controls before retaining the current absolute statement.

### 12. Draft-completion items — lower priority but required

Complete every blank before signing: agreement reference/date, company registration/contact details, landlord identity/authority, property/rooms/beds, term, agreed checks and limits, all fee rows/initials, tax treatment, waiver end date, additional services, and attachments. Correct the visible spacing/typos (“Landlordor”, “workis”, “Payments cancellations and refunds”) and define “activation”, “completion of booking by tenant”, “successful booking”, and “free trial” so they cannot be read as student charges. Do not rely on the header as a substitute for clause 1 notice details.

## Factual questions before signature

1. What is the verified legal operator: Akolet Properties Ltd, another company, or a trading/affiliate arrangement? Does current company evidence confirm URSB number 80034439190764? What are the registered office, signatory authority, invoice recipient, and notice contacts? Is the Maimood Hostel Office J07 address only a working office, and how is it reconciled with the TechBuzz Hub/Ntinda address in the company overview?
2. Is CampusHomes intended to be a section 49 agent for marketing/communications, an independent marketplace, or both depending on the service? What written scope is shown to students, and will any staff negotiate terms, arrange repairs, collect a fee, or handle disputes?
3. What exactly is the product state transition from free reservation to booking request to landlord-confirmed booking to tenancy? Is the landlord's portal confirmation only an inventory record, or a binding pre-tenancy commitment? Is a bilateral tenancy agreement signed separately or through the platform's tenant-agreement form?
4. Is reserving, enquiring, viewing, and messaging always free to students? Does any landlord booking fee exist? If the product or a proposal says 10%, is that a landlord-to-student fee or the B2B CampusHomes commission, and what is its basis, recipient, receipt, tax, and refund treatment?
5. Are rents monthly, termly, or per semester in the relevant property? If any rent exceeds the Act's default advance period, where is the landlord-student mutual agreement recorded under section 24(2)? What deposit amount, deduction conditions, receipt, and refund timing are used?
6. Does every listing receive a recorded physical visit before publication? What exact rooms, facilities, safety observations, identity/authority documents, and landlord representations are checked, and how are the date, scope, material changes, closure, and reinspection displayed?
7. Which listed properties could fall within section 1(3)'s institution, transient-lodging, or employment-housing exclusions? Are ordinary student hostels being treated as residential premises?
8. What process checks and documents landlord authority to let, and who performs the student identification check required by section 3(5) without publishing or over-retaining identity documents?
9. What is the policy for male-only/female-only/mixed properties and how has it been reviewed against section 20?
10. What is the live data schedule for enquiries, messages, reservations, identity documents, inspection evidence, and tenancy forms, including processors, retention, deletion, breach response, and permitted off-platform contact?
11. When service access is suspended or the B2B agreement ends, who contacts students with active reservations, confirmed bookings, or tenancies, and what support channel remains?
12. Which Akolet-issued terms, privacy notice, payment-channel addendum, and safety/inspection policies are incorporated, with what version/effective date and conflict order? Has Ugandan counsel confirmed the current consolidated Act, later amendments/regulations, agent/licensing implications, consumer/tax treatment of any fee, the Electronic Transactions Act 2011 wording and Schedule 2 question, and the document hierarchy as at signature?

## Discrepancies versus proven illegality

Confirmed from the reviewed materials:

- The agreement leaves the operator's registration and notice fields blank, while the product materials use a free reservation, a later landlord booking confirmation, direct landlord payment, inspection-date disclosure, semester rent, a separate landlord booking-fee field, and student-landlord messaging.
- The agreement uses “booking” without defining the product's reservation/booking/tenancy states.
- The fee row is blank and says “first month's rent”; no 10% figure appears in this DOCX, and the product's landlord booking fee is a separate field expressed against semester rent.
- The contract makes a property visit optional while the public product describes a physical inspection before publication; the contract's non-guarantee language is directionally aligned but needs scope/date wording.
- The agreement says CampusHomes supports booking communications but does not state whether that is a limited agency appointment.
- The agreement header uses a Maimood address and blank registration/contact fields, while the separate company overview states a URSB number and an older Ntinda address; the overview's “book and pay”/automated-rent-collection claims also conflict with the current direct-payment model unless marked as roadmap.

Legal or regulatory risks requiring facts and Ugandan counsel, rather than conclusions of illegality from this review:

- Whether the actual conduct makes CampusHomes an agent under section 49 and whether any licensing or disclosure rules apply.
- Whether a landlord-to-student “booking fee” is a lawful extra service fee or another charge under the applicable facts; section 46 is not a blanket approval of every booking fee.
- Whether gender-restricted accommodation is compatible with section 20 in the particular housing context.
- Whether a given hostel is covered by the Act or falls within an exemption in section 1(3).
- Whether the portal's click/e-signature record satisfies the Electronic Transactions Act 2011 and the parties' proof/authority needs.
- Whether any student tenancy or other document falls within the Electronic Transactions Act Schedule 2 property-interest exclusion, and what electronic form/signature and registration steps are required.
- Whether any post-31 December 2023 amendment, regulation, or case changes the baseline above.

