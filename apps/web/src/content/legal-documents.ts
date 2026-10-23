// Review content from docs/legal/2026-10-23-uganda-review in the original workspace.
// Keep draft status until the owner approves factual details and the effective version.
// Static structured content: no runtime file reads or HTML injection.
export type LegalBlock = { type: "paragraph"; text: string } | { type: "list"; items: string[] };
export type LegalDocument = {
  title: string;
  kind: "privacy" | "terms";
  version: string;
  prepared: string;
  downloadHref: string;
  sections: { id: string; title: string; blocks: LegalBlock[] }[];
};

export const privacyPolicy: LegalDocument = {
  "title": "Privacy policy",
  "kind": "privacy",
  "version": "CH PP 2026 10 D1",
  "prepared": "23 October 2026",
  "downloadHref": "/legal/CampusHomes-Privacy-Policy-DRAFT.docx",
  "sections": [
    {
      "id": "draft-status",
      "title": "Draft status and publication conditions",
      "blocks": [
        {
          "type": "paragraph",
          "text": "This is a proposed CampusHomes notice issued by Akolet Properties Ltd. It is separate from a privacy notice for Akolet's corporate website, employment records or other products. The company name appears in the supplied company overview and landlord agreement; it has not been independently verified against URSB. The overview gives registration number 80034439190764, which must be verified before publication. Confirm the registered office, address for legal service, designated data protection officer, PDPO registration and live service providers."
        },
        {
          "type": "paragraph",
          "text": "The notice below describes the reviewed product and proposes controls for sensitive information, children, transfers and rights requests. Those controls must be implemented and checked before the corresponding statements are published. The accompanying research and implementation report identifies these conditions. This draft is neither an effective policy nor evidence of regulatory registration or operational compliance."
        }
      ]
    },
    {
      "id": "about",
      "title": "1 Who is responsible for your information",
      "blocks": [
        {
          "type": "paragraph",
          "text": "CampusHomes is a student accommodation platform operated by Akolet Properties Ltd, referred to here as Akolet, we or us. We decide how information is used to run CampusHomes accounts, listing and inspection services, reservations, communications, support and platform security. For those activities we act as a data controller under Uganda's Data Protection and Privacy Act 2019."
        },
        {
          "type": "paragraph",
          "text": "This policy applies to campushomes.co.ug and its student, landlord and staff portals, inspections and related CampusHomes communications. A landlord may independently decide how to use information for a tenancy. Where we provide a landlord with tools to administer tenant information on its instructions, the applicable roles and responsibilities must also be described in the notice on that form and our agreement with the landlord. A landlord's own legal responsibilities do not disappear because it uses CampusHomes."
        },
        {
          "type": "paragraph",
          "text": "Contact our privacy lead through info@akolet.co.ug, using the subject CampusHomes privacy request. Our shared office is Maimood Hostel, Office J07, Nkinzi Road, opposite Makerere Eastern Gate, Kampala, Uganda. Call +256 732 152 211 or contact us on WhatsApp at +256 768 561 023 to arrange a secure way to make a request. Do not send passwords, sign-in codes or identity-document copies through a public message. The named data protection officer and verified registered and service addresses must be inserted in this section before publication."
        }
      ]
    },
    {
      "id": "what-we-collect",
      "title": "2 Information we collect and where it comes from",
      "blocks": [
        {
          "type": "paragraph",
          "text": "We collect information you enter, information another person lawfully supplies for an enquiry or tenancy, observations made during inspections, and technical records generated when you use the service."
        },
        {
          "type": "list",
          "items": [
            "Account and contact information includes your name, username, email address, telephone numbers, sign-in identifiers and verification status. If you choose Google sign-in, we receive the identity information authorised through that sign-in process.",
            "Student profile information can include university, year of study, date of birth, gender, nationality, address and emergency-contact details. The form must identify required and optional fields and explain the consequence of leaving a required field blank.",
            "Landlord and property information includes legal and business names, contact details, authority to advertise or let, verification information and documents where requested, property location, room inventory, rent, deposits, charges, amenities, rules, photographs and inspection records.",
            "Service records include favourites, reservations and their expiry, booking requests and confirmations, move-in confirmations, viewing requests, enquiries, landlord messages, reviews, calendar reminders, complaints and safety reports.",
            "Tenant registration and agreement forms can include identity or passport numbers, student registration details, course, parent or guardian and next-of-kin contacts, rent and move-in information, a typed or drawn signature, and other information identified on the particular form. Some forms may ask for optional medical conditions or allergies. Section 4 explains the additional protections for these records.",
            "Support information includes what you send to our team, related replies and references. If you use CampusHomes AI, your question and recent conversation messages are sent to an external AI service as described in section 7.",
            "Technical and usage information includes page paths, selected action events, search terms and filters recorded by the search service, listing references and result counts, security and error logs, IP addresses, browser information and session records where generated. Our browser page-view event does not include the search query string, but the separate search service currently records submitted search text. Do not put private information into a hostel search.",
            "Direct payment records may include a landlord's confirmation of an amount received and the payment method or booking reference. CampusHomes does not take rent or deposits in its current service and does not ask for your card PIN, mobile-money PIN or sign-in code."
          ]
        },
        {
          "type": "paragraph",
          "text": "An identity document, medical detail, signature or private message is not ordinary public listing content. We do not ask you to post it in a review or listing photograph. Tell other people before supplying their contact information, provide only what is necessary, and give them access to this policy. Where another lawful notification or consent is required, we and the relevant landlord must arrange it rather than assuming that you can consent for another adult."
        }
      ]
    },
    {
      "id": "why",
      "title": "3 Why we use information and the legal basis",
      "blocks": [
        {
          "type": "paragraph",
          "text": "We use information for specified purposes and only where Ugandan law permits it. Uganda's Act generally requires prior consent, with specific exceptions including processing necessary for a contract or requested steps before a contract and processing required by law. Accepting website terms is not consent to every possible use of information."
        },
        {
          "type": "list",
          "items": [
            "To establish and secure an account, provide requested searches and saved listings, operate a reservation, route a message or viewing request, and record booking activity, we use the information necessary to provide the service you request and perform the relevant contract.",
            "To check a landlord's identity and authority, assess a listing, record an inspection and investigate inaccuracies, we use information necessary for the listing service and applicable legal duties. We explain the documents required and avoid retaining unnecessary copies.",
            "To respond to support and safety requests, resolve disputes and preserve relevant evidence, we use information necessary to handle your request, fulfil our obligations or comply with law. A report may need to be shared with the affected person so they can respond, but unnecessary reporter details must be protected.",
            "For optional health information, optional promotional communications and other processing that relies on consent, we ask for a specific, informed choice. You can withdraw that consent through the privacy contact without making earlier lawful processing unlawful. We explain any practical effect on the optional service.",
            "For security, fraud prevention and operational measurement, we document the applicable statutory permission, necessity and safeguards. Cookieless measurement is still subject to privacy obligations where the records identify or can be linked to a person. We do not treat a general claim of legitimate interest as permission for unrelated collection."
          ]
        },
        {
          "type": "paragraph",
          "text": "These general grounds do not displace the additional restrictions for special personal data, including financial information, in section 4. We do not sell personal information. We do not use account information for unrelated partner marketing merely because you search, reserve or contact a landlord. Any new purpose must be assessed and explained before it begins, with a new consent where required."
        }
      ]
    },
    {
      "id": "sensitive-data",
      "title": "4 Sensitive information and tenant forms",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Health conditions, medical records and financial information are special personal data under section 9 of Ugandan law, as are religious or philosophical beliefs, political opinions and sexual-life information. Rent and payment records can contain financial information even when CampusHomes does not receive the payment. These categories need their own assessment and a permitted condition under section 9, in addition to the general processing rules. Do not put them in ordinary searches, public reviews or the AI assistant."
        },
        {
          "type": "paragraph",
          "text": "If a tenant form offers an optional medical or allergy field, the form must explain why it is needed, who can see it, its retention period and the applicable legal basis before submission. Where section 9 subsection 3 paragraph b is relied on, the information must be given freely with the data subject's consent; we require a separate affirmative choice for optional health information. Declining it must not prevent use of the ordinary search or reservation service. Section 9 also contains specific employer-duty and qualifying non-profit-body conditions, which are not general permissions for CampusHomes. A general contractual, medical-purpose or legal-obligation ground under section 7 must not be assumed to override section 9. Counsel must confirm the permitted treatment of financial and any emergency medical records before that processing is offered."
        },
        {
          "type": "paragraph",
          "text": "Landlords must collect only information reasonably required for the identified tenancy purpose and must not use tenant forms to collect unrelated personal details. A general declaration at the end of a form does not replace a specific notice or necessary consent. Identity documents and signatures require restricted access and must not be placed in a public photo bucket."
        }
      ]
    },
    {
      "id": "children",
      "title": "5 Children and guardians",
      "blocks": [
        {
          "type": "paragraph",
          "text": "CampusHomes account and reservation services are intended for adults aged 18 and above. This is the proposed service eligibility rule, not a statement that every Ugandan contract involving a younger person is invalid. Under-18 accounts and reservations are unavailable until we have an approved and supported guardian process. If you are under 18, do not submit personal information or reserve through the ordinary workflow; your parent or legal guardian may contact our team to discuss an appropriate route. Publicly viewing general information does not authorise submission of a child's data."
        },
        {
          "type": "paragraph",
          "text": "Before a supported guardian process collects a child's data, we must ascertain age, verify the appropriate adult's authority and obtain prior parental or guardian consent unless a specific legal exception applies. Merely entering a parent's telephone number is not guardian consent. If child information has been submitted without an appropriate basis, contact us so we can restrict further use and decide what must be deleted or lawfully retained. We do not use children's information for targeted marketing."
        }
      ]
    },
    {
      "id": "sharing",
      "title": "6 Who receives information",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Public visitors can see published property descriptions, location information, approved photographs, room features, rules, relevant landlord profile information and public reviews. Landlord join dates and response summaries, where shown, derive from platform records. A response estimate is historical information, not a promise that every message will receive a reply within 24 hours."
        },
        {
          "type": "paragraph",
          "text": "The relevant landlord and authorised property team receive information needed for your enquiry, viewing, reservation, booking or tenant administration. They do not receive unrestricted access to all your CampusHomes records. Other participants can retain messages you sent them, and a landlord may need to retain its own lawful tenancy records after your platform account closes."
        },
        {
          "type": "paragraph",
          "text": "Authorised Akolet personnel may access records needed for support, inspections, security, moderation, compliance or dispute handling. Platform messages are stored and processed by the service; do not assume they are end-to-end encrypted or inaccessible to authorised support personnel. Content or contact filtering may be used to prevent abuse, subject to appropriate safeguards and review."
        },
        {
          "type": "paragraph",
          "text": "Service-provider categories include hosting and database infrastructure, identity and sign-in systems, email and verification delivery, storage, network protection, error monitoring, messaging infrastructure and the optional AI assistant. The source code supports Logto, Google sign-in, Resend, Backblaze B2, legacy Cloudinary storage, Sentry, Soketi and Groq. WhatsApp or Africa's Talking integrations may be used where the relevant verification or notification channel is enabled. Which services are active, their legal roles and processing countries must be confirmed in the published provider register. Code support alone does not prove that a provider is deployed."
        },
        {
          "type": "paragraph",
          "text": "We disclose information to authorities where lawfully required, and to professional advisers where necessary and appropriately protected. If a business transfer affects your information, we must assess the lawful basis, confidentiality and notice requirements. We do not treat that possibility as permission for unrelated sale or marketing of user records."
        }
      ]
    },
    {
      "id": "ai",
      "title": "7 AI support and external services",
      "blocks": [
        {
          "type": "paragraph",
          "text": "CampusHomes AI provides general guidance from the user manual. In the reviewed implementation, your submitted question and up to 12 recent conversation messages are sent through our server to Groq's API to produce a reply. The app limits each message to 1000 characters. It does not deliberately attach your account profile, reservation or private landlord messages to the AI request, but anything you type into the chat is part of the transmitted content."
        },
        {
          "type": "paragraph",
          "text": "The chat shown in your browser is held in page memory in the reviewed implementation. That does not mean the external provider or infrastructure keeps no records. Provider retention, access, processing countries and any secondary use must be disclosed and assessed before this feature handles personal information. Do not send identity numbers, medical information, passwords, payment credentials or another person's private details. You can use the user manual or contact our team instead. AI replies may be inaccurate and do not decide your tenancy, booking eligibility or a legal dispute."
        },
        {
          "type": "paragraph",
          "text": "OpenStreetMap tile servers receive technical connection information, including your IP address, when a map loads. If you choose a Google directions link, Google processes the resulting visit under its own terms. Clicking a WhatsApp link opens an external service and shares the content you choose to send; the floating shortcut itself is locally served and is not an embedded third-party chat widget. Email, telephone and social services you independently use also have their own privacy practices."
        }
      ]
    },
    {
      "id": "transfers",
      "title": "8 Processing outside Uganda",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Some infrastructure and service providers may process information outside Uganda. Before a transfer, we must identify the destination, recipients and onward transfers and satisfy section 19 of the Act and regulation 30 of the Data Protection and Privacy Regulations 2021. We must demonstrate the required equivalent protection to the Office or obtain the appropriate informed consent, and obtain any express consent required for onward transfer to a third country. Where a destination is not on the relevant Gazette list, the organisation bears the proof burden for adequacy. A provider contract by itself does not prove that the destination meets Ugandan requirements."
        },
        {
          "type": "paragraph",
          "text": "Before publication, Akolet must complete its internal recipient and country register and include the verified recipients, destinations and safeguards in the user-facing notice. Publishing a separate provider register is a proposed transparency measure, not a claim that the Act prescribes that exact format. If a feature relies on your consent for an international transfer, we must explain the destination and relevant implications before the transfer. For AI help, the manual and team contact provide alternatives. We do not obtain blanket permission to send data anywhere in the world by your continued use of the website."
        }
      ]
    },
    {
      "id": "cookies",
      "title": "9 Cookies and storage on your device",
      "blocks": [
        {
          "type": "paragraph",
          "text": "CampusHomes uses session and sign-in cookies to authenticate requests and protect the sign-in process. The reviewed application session cookie is campushomes-session-v1, with a seven-day application session lifetime; separate identity-provider and temporary sign-in cookies may have different lifetimes. The deployed cookie inventory must list the actual names, purposes and expiry periods."
        },
        {
          "type": "paragraph",
          "text": "Local storage keeps preferences such as your theme, recently viewed listings, sidebar state and dismissal of the cookie notice. Session storage can keep the position of the movable WhatsApp shortcut and navigation state. Staff inspection tools can keep draft photographs, location observations and inspection notes in IndexedDB until synchronised or removed. Those drafts are work records on the staff device and require device safeguards and a cleanup process."
        },
        {
          "type": "paragraph",
          "text": "The reviewed browser analytics component sends first-party page-view and selected action events without a tracking cookie. This is separate from search-service events and security logs. We have not verified production scripts or identity-provider cookies through a live cookie audit. Optional advertising, third-party tracking or new persistent identifiers must not be introduced under an essential-only notice; the purpose, legal basis and choice mechanism must be updated first."
        },
        {
          "type": "paragraph",
          "text": "You can clear browser storage through your browser settings. This may sign you out, remove preferences or remove unsynchronised drafts; it does not erase records already sent to us. Removing a cookie notice does not withdraw every consent or close your account."
        }
      ]
    },
    {
      "id": "retention",
      "title": "10 Retention and deletion",
      "blocks": [
        {
          "type": "paragraph",
          "text": "We retain personal information only for its specified purpose, a lawful related function or an applicable legal requirement. Relevant factors include the account or tenancy relationship, verification need, dispute or safety investigation, contractual evidence and statutory record-keeping. A general wish to keep information useful indefinitely is not a retention rule."
        },
        {
          "type": "paragraph",
          "text": "The published notice must include the approved schedule for account records, identity documents, tenant forms and health details, messages and support records, inspections, search and usage events, security logs, backups and external-provider copies. Exact periods remain subject to approval and implementation; this draft does not invent statutory periods for these categories."
        },
        {
          "type": "paragraph",
          "text": "When retention is no longer justified, the information must be securely deleted, destroyed or de-identified so it cannot be reconstructed in identifiable form. A legal hold must be documented, access restricted and the hold reviewed. Account closure, account deletion, anonymisation and removal from a public listing are different actions. Removing a database row does not automatically remove storage objects, identity-provider records, backups or a landlord's independently held tenancy records."
        },
        {
          "type": "paragraph",
          "text": "You may request account closure or deletion through the privacy contact. We will explain any information that must be retained, the reason and applicable period, and which other controller you may need to contact. We must manage deletion across our own systems and contracted providers and keep failed deletion tasks under review. Backup expiry and restoration controls must prevent an erased record from being silently restored into active use."
        }
      ]
    },
    {
      "id": "security",
      "title": "11 Security and incidents",
      "blocks": [
        {
          "type": "paragraph",
          "text": "We are responsible for appropriate technical and organisational safeguards, including access restrictions, secure transmission, authentication, private storage for sensitive records, staff confidentiality, logging and regular verification of controls. We also require appropriate safeguards from processors. These are continuing duties and do not amount to a guarantee that no incident can occur."
        },
        {
          "type": "paragraph",
          "text": "If we believe personal data has been accessed or acquired by an unauthorised person, we must notify Uganda's Personal Data Protection Office through the prescribed Authority procedure immediately and provide information about remedial action. We must follow the Authority's directions on informing affected people. We do not substitute a general 72-hour waiting period for the Ugandan notification requirement."
        },
        {
          "type": "paragraph",
          "text": "Protect your sign-in method, avoid shared-device access to sensitive forms, sign out after use, and report suspected misuse through the contact details above. CampusHomes staff should never ask for your password, verification code or mobile-money PIN."
        }
      ]
    },
    {
      "id": "rights",
      "title": "12 Your rights and how to make a request",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Subject to the conditions and safeguards in Ugandan law, you may request confirmation and access to information about you and its recipients; correction or deletion of records that are inaccurate, irrelevant, excessive, out of date, incomplete, misleading, unlawfully obtained or no longer authorised to be retained; prevention of certain harmful or incompatible processing; and an end to direct marketing. You may withdraw consent where processing relies on it. Qualifying significant decisions based solely on automated processing are subject to statutory protections and reconsideration rights. The support chatbot does not itself make booking or tenancy decisions."
        },
        {
          "type": "paragraph",
          "text": "Email info@akolet.co.ug with enough detail to locate the records and understand the request. We may need proportionate proof of identity or authority to act for someone else. Ask for a secure submission route for identity evidence. We must protect other people's information when providing a copy. Current PDPO forms, including Form 8 for access, are available through the Personal Data Protection Office; our team should help you use the appropriate procedure."
        },
        {
          "type": "paragraph",
          "text": "We will give the access decision within seven days and comply promptly within the Act's 30-day outer period, subject to its conditions. We will give the written decision on correction or deletion within seven days. Notices concerning prevention of processing or direct marketing have applicable 14-day response requirements. Where the automated-decision rules apply, we must explain and follow the relevant notification and reconsideration procedure, including its 21-day periods; the implementing regulations also contain a 14-day response path. If we refuse or partly refuse a request, we will explain the reason and complaint route. These legal timelines must be supported by an operational request process before publication."
        }
      ]
    },
    {
      "id": "changes",
      "title": "13 Complaints and changes",
      "blocks": [
        {
          "type": "paragraph",
          "text": "You can contact our privacy lead and complain directly to Uganda's Personal Data Protection Office at https://pdpo.go.ug. You do not have to exhaust our internal process before exercising a statutory complaint or court right. Use the current regulator portal for complaint forms and official contact details."
        },
        {
          "type": "paragraph",
          "text": "We will date and version this policy, keep prior versions and communicate material changes in a suitable way. A changed notice does not retrospectively authorise a new use or replace consent where consent is required. The CampusHomes Terms and Conditions explain the service relationship; they do not remove your statutory privacy rights."
        }
      ]
    },
    {
      "id": "research",
      "title": "Research basis",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Primary foundations are Uganda's Data Protection and Privacy Act 2019, now published as Cap 97, and the Data Protection and Privacy Regulations 2021, SI 21. For sources, section references, unresolved facts and engineering requirements, see the accompanying Uganda Research and Implementation Report and privacy research ledger. DigsConnect was used to compare subject coverage only; its South African legal bases, business model and wording have not been adopted."
        },
        {
          "type": "list",
          "items": [
            "[Data Protection and Privacy Act from the ICT Ministry](https://ict.go.ug/site/documents/Data-Protection-and-Privacy-Act-2019.pdf)",
            "[Data Protection and Privacy Regulations from NITA U](https://oldsite.nita.go.ug/sites/default/files/2022-11/Data_Protection_and_Privacy_Regulations-2021.pdf)",
            "[Personal Data Protection Office](https://pdpo.go.ug/)"
          ]
        }
      ]
    }
  ]
};

export const termsAndConditions: LegalDocument = {
  "title": "Terms and conditions",
  "kind": "terms",
  "version": "CH TC 2026 10 D1",
  "prepared": "23 October 2026",
  "downloadHref": "/legal/CampusHomes-Terms-and-Conditions-DRAFT.docx",
  "sections": [
    {
      "id": "draft-status",
      "title": "Draft status and publication conditions",
      "blocks": [
        {
          "type": "paragraph",
          "text": "These proposed terms cover CampusHomes, issued by Akolet Properties Ltd. They do not replace terms for Akolet's corporate website or other services. The operator identity, registration, service address, agency scope, eligibility rule, fee arrangements and contract-acceptance process must be confirmed before publication. Public website changes must not silently amend a signed landlord agreement or an existing tenancy."
        },
        {
          "type": "paragraph",
          "text": "The reviewed service uses free reservations and direct landlord rent payments. Payment-collection code or roadmap statements are not authority to introduce a payment service. These terms must be revisited before money collection, wider property management, subscriptions or other materially different services are activated. The accompanying report sets out legal and engineering conditions; this draft is not an executed agreement or legal certification."
        }
      ]
    },
    {
      "id": "contact",
      "title": "1 The operator and these terms",
      "blocks": [
        {
          "type": "paragraph",
          "text": "CampusHomes is operated by Akolet Properties Ltd, called Akolet, we or us in these terms. CampusHomes is the platform name, not a separate legal contracting person. These terms apply to campushomes.co.ug and its student, landlord and staff portals and the CampusHomes services described below."
        },
        {
          "type": "paragraph",
          "text": "Contact info@akolet.co.ug or +256 732 152 211. Our shared office is Maimood Hostel, Office J07, Nkinzi Road, opposite Makerere Eastern Gate, Kampala, Uganda. WhatsApp support is +256 768 561 023. Before publication, this section must include the verified company registration number, place of registration, registered office and address for legal service, and supplier particulars required by applicable law, including directors' names where required. The supplied company overview gives URSB number 80034439190764, which requires verification. The shared office must not be described as the registered office without confirmation."
        },
        {
          "type": "paragraph",
          "text": "Read these terms before creating an account or making a reservation. We must present a retrievable version and obtain a clear acceptance for contractual actions, let you review and correct information before submission, and give you a record of the action. Viewing a page does not constitute consent to optional marketing or sensitive-data processing. Our Privacy Policy explains personal-information handling separately."
        }
      ]
    },
    {
      "id": "what-we-do",
      "title": "2 What the platform provides",
      "blocks": [
        {
          "type": "paragraph",
          "text": "CampusHomes helps students search and compare advertised accommodation, view published inspection information, contact a landlord, request a viewing, make a temporary reservation, request a booking and record related communication and move-in activity. It also provides listing and administration tools for landlords and authorised property teams."
        },
        {
          "type": "paragraph",
          "text": "Unless a separate written appointment expressly says otherwise, we do not own or let the advertised accommodation, sign a tenancy for a landlord, set rent, receive rent or deposits, guarantee a tenant or landlord, or carry out an eviction. The landlord and student remain responsible for agreeing and performing their tenancy and for complying with applicable law."
        },
        {
          "type": "paragraph",
          "text": "If an agreed service makes Akolet a limited marketing or communications agent, the written appointment must identify the principal and scope and be disclosed as required by law. Describing the service as a platform does not override the legal consequences of what staff actually do. A broader management or payment appointment requires a separate signed agreement and the necessary regulatory assessment."
        }
      ]
    },
    {
      "id": "accounts",
      "title": "3 Eligibility and accounts",
      "blocks": [
        {
          "type": "paragraph",
          "text": "The proposed ordinary account and reservation service is for people aged 18 or above with capacity to enter the relevant agreement. Under-18 accounts and reservations are unavailable until a guardian-assisted process is approved and supported. A parent or legal guardian may contact our team to discuss an appropriate route before the child's information is submitted. This eligibility rule is a service choice; it does not describe every exception in Ugandan capacity law."
        },
        {
          "type": "paragraph",
          "text": "Provide accurate information and keep it current. Use your own account and only act for another person or organisation if you have authority. A landlord, caretaker or company representative must accurately identify the person legally entitled to let the property and the representative's role. Do not impersonate another person or share credentials. One account can have the workspaces legitimately assigned to it; a visible navigation option does not grant authority to access another user's records."
        },
        {
          "type": "paragraph",
          "text": "Keep your sign-in method secure and report suspected compromise promptly. You are responsible for authorised use of your account, but these terms do not automatically make you liable for every unauthorised act regardless of its cause. We remain responsible for our own legal and security duties."
        }
      ]
    },
    {
      "id": "verification",
      "title": "4 Listings inspections and information",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Listings must identify the accommodation, location, room or allocation category, occupancy, rent amount and period, deposits, mandatory charges, utilities, availability, material rules and relevant restrictions. Any landlord booking or administration charge must be identified separately from rent and from an Akolet service fee, with its basis, recipient, timing and cancellation treatment. An undisclosed charge is not authorised merely because the listing contains a generic reference to other costs."
        },
        {
          "type": "paragraph",
          "text": "A published inspection or verification label describes the checks actually performed on the stated date and their recorded scope. It does not guarantee future conditions, title, structural soundness, personal safety, occupancy or another person's conduct. We must use reasonable care in our own work and correct substantiated errors; this qualification does not exclude those duties. Photographs may show a room category rather than your exact allocated room, which must be made clear before you commit."
        },
        {
          "type": "paragraph",
          "text": "Prices and availability may change prospectively. Before accepting a booking or tenancy, confirm the exact room or allocation method, total price, term, move-in date, deposit, charges, utilities, cancellation terms and landlord identity in a durable record. A material substitution or new charge needs the student's informed agreement. Location estimates are approximate; a straight-line campus estimate is not a walking or driving time."
        }
      ]
    },
    {
      "id": "messages",
      "title": "5 Enquiries viewings and messages",
      "blocks": [
        {
          "type": "paragraph",
          "text": "An enquiry or viewing request is a request for communication, not a confirmed appointment, reservation or tenancy. The landlord must agree the viewing time and access arrangements. A response estimate shown on a landlord profile is based on the disclosed measurement period and available platform records; it is not a guaranteed response deadline."
        },
        {
          "type": "paragraph",
          "text": "Use messages for the relevant accommodation or service. Do not send fraud, threats, harassment, unlawful content or unsolicited promotions, and do not seek passwords, verification codes or payment PINs. We may apply proportionate anti-abuse filters and investigate reports. Any restriction on sharing contact details must be clearly explained and must not prevent lawful safety reporting, statutory notices or access to a regulator."
        },
        {
          "type": "paragraph",
          "text": "Platform messages are stored and routed to the relevant parties. Authorised staff may review relevant records for support, safety and enforcement under the Privacy Policy. WhatsApp, telephone, email and map services opened outside CampusHomes are separate services with their own terms. Opening a share option does not authorise CampusHomes to send a message on your behalf without your action."
        }
      ]
    },
    {
      "id": "reservations",
      "title": "6 Free reservations and expiry",
      "blocks": [
        {
          "type": "paragraph",
          "text": "A reservation is a free, temporary platform hold of an available bed while you arrange the next steps. CampusHomes takes no reservation payment in the current service. A hold does not itself grant possession, create a tenancy, prove rent payment or guarantee that all tenancy conditions have been agreed."
        },
        {
          "type": "paragraph",
          "text": "The server-confirmed expiry shown in the reservation record governs the hold. A countdown on your device is a display aid. The current service permits up to five active reservations, subject to inventory and the limit of one active reservation per hostel room category and bathroom configuration. Before changing those limits, we must update the interface and applicable terms consistently."
        },
        {
          "type": "paragraph",
          "text": "You can cancel an eligible hold through My reservations. A hold may expire or be released under the displayed rules, for a corrected inventory conflict or for a necessary safety or fraud response. We should tell you when a hold is released early and explain the next step where appropriate. Release of a platform hold is not an eviction or automatic cancellation of a tenancy that was formed separately. Do not pay someone who describes a CampusHomes free hold as a compulsory CampusHomes fee."
        }
      ]
    },
    {
      "id": "bookings",
      "title": "7 Booking requests tenancy and move in",
      "blocks": [
        {
          "type": "paragraph",
          "text": "After viewing or otherwise assessing the accommodation and agreeing the relevant terms, you can send a booking request. The landlord decides whether to accept and records the appropriate confirmation. An automated receipt or a student pressing a request button is not the landlord's acceptance."
        },
        {
          "type": "paragraph",
          "text": "A confirmed status records the landlord's platform action. Whether the parties have also formed a binding tenancy or other agreement depends on their actual offer, acceptance, terms and applicable law; a platform label cannot remove a contract or statutory right already created. The landlord and student must identify each other and provide and retain the tenancy record required by law. An agreement made through an electronic form must satisfy the applicable legal requirements, including any property-registration or document-form requirements."
        },
        {
          "type": "paragraph",
          "text": "Pay rent, deposits and lawful landlord charges directly to the identified landlord through the agreed channel and obtain the required receipt. Check the tenancy and payment instructions before sending money. CampusHomes does not hold these funds, act as escrow or promise a refund from funds it has never received. A landlord's recorded payment confirmation is not a CampusHomes bank receipt."
        },
        {
          "type": "paragraph",
          "text": "Arrange keys, physical access, room condition and move-in directly with the landlord. A move-in confirmation in CampusHomes records the relevant action; it is not a property inspection, legal waiver or guarantee that every tenancy obligation has been performed. Report material discrepancies promptly and keep your own agreements, receipts and messages."
        }
      ]
    },
    {
      "id": "cancellation",
      "title": "8 Cancellation refunds and statutory rights",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Cancelling a free CampusHomes hold carries no CampusHomes cancellation charge. Once a booking or tenancy has been agreed, cancellation, withdrawal and refunds depend on the lawful terms disclosed before acceptance and any mandatory Ugandan rights. A landlord must not substitute a hidden no-refund rule after payment."
        },
        {
          "type": "paragraph",
          "text": "The landlord is responsible for lawful refunds of rent, deposits and landlord charges paid directly to it. Where a room is unavailable or materially misdescribed, report it and seek an appropriate remedy from the landlord. We can assist with communication and investigate platform conduct; that does not make us the holder of the payment. Akolet remains responsible for refunds of its own charges where legally or contractually due."
        },
        {
          "type": "paragraph",
          "text": "Uganda's Electronic Transactions Act contains consumer disclosure, cancellation, performance and refund provisions. Their applicability and any exceptions depend on the actual transaction. Nothing in these terms waives or reduces a non-excludable right. In particular, we do not impose a universal no-refund rule or claim that every accommodation-related transaction is automatically exempt from electronic-consumer protections. Obtain advice on the particular dispute if the parties disagree."
        }
      ]
    },
    {
      "id": "landlords",
      "title": "9 Landlord duties and tenancy protections",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Landlords must have lawful authority to advertise and let, provide evidence reasonably needed for the listing service, obtain required permissions and disclose material changes promptly. They must keep information and availability accurate, provide habitable accommodation, handle repairs and access lawfully, avoid unlawful discrimination, protect tenant information and apply the agreed terms fairly."
        },
        {
          "type": "paragraph",
          "text": "For tenancies to which Uganda's Landlord and Tenant Act 2022 applies, statutory obligations on identification, tenancy copies, receipts, deposits, advance rent, quiet enjoyment, repairs, notices and lawful termination continue to apply. A house rule, website term or platform status cannot exclude a mandatory provision of that Act. The Act has scope exclusions; a residence's student label alone does not determine whether an exclusion applies."
        },
        {
          "type": "paragraph",
          "text": "Before agreement, landlords must disclose the full rent and payment period and any requirement to pay a semester in advance. They must record any agreement needed to depart from the statutory advance-rent default, comply with applicable security-deposit limits and give the required receipts. A service or commission fee must not be used to conceal an unlawful rent or deposit charge."
        },
        {
          "type": "paragraph",
          "text": "Landlords must not use CampusHomes suspension, a cancelled hold or a review dispute as permission to enter or evict unlawfully, seize belongings or disconnect essential services unlawfully. Any occupancy restriction requires a lawful basis; a platform gender filter does not certify legality. Authorised custodians and agents must act within the scope of their appointment."
        }
      ]
    },
    {
      "id": "fees",
      "title": "10 Akolet charges and landlord service agreements",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Current student reservations are free from CampusHomes. Any separate Akolet subscription, inspection, photography, promotion or landlord commission must be set out in a completed written quotation or landlord service agreement accepted by the person who must pay. A blank fee row or a website feature does not create a fee."
        },
        {
          "type": "paragraph",
          "text": "The fee record must state the precise amount or percentage basis, cap if any, currency, taxes, activation, invoice timing, payment deadline and cancellation or refund treatment. Where rent is per semester, an assumed first-month basis must not be applied without an explicit agreed conversion. A CampusHomes commission payable by a landlord is distinct from a landlord's charge to a student. Free trials must not silently convert into paid services."
        },
        {
          "type": "paragraph",
          "text": "Staff must not direct payment to personal accounts. Any future collection of rent, deposits or funds for onward settlement requires a separate approved payment model, licensed-provider arrangements where applicable, updated disclosures and contracts, privacy review and tested accounting, refund and reconciliation controls before activation."
        }
      ]
    },
    {
      "id": "content",
      "title": "11 User content and intellectual property",
      "blocks": [
        {
          "type": "paragraph",
          "text": "You retain ownership of content you lawfully supply. You grant Akolet a non-exclusive permission to host, reproduce, format and display it as needed to provide the relevant CampusHomes service and, for approved listing material, advertise that property. This permission is limited by the purpose, audience, duration and privacy choices applicable to the content. A private message or identity document is not licensed for public advertising merely because it was uploaded."
        },
        {
          "type": "paragraph",
          "text": "You must have the necessary rights and permissions for photographs, descriptions and other material, including appropriate permission for identifiable people. Do not copy another service's listing or policy without permission. CampusHomes software, branding and other protected materials remain owned by their rights holders. Any restriction on copying, reverse engineering or extraction applies only to the extent permitted by law and does not override statutory exceptions."
        },
        {
          "type": "paragraph",
          "text": "Reviews must reflect genuine relevant experience. Do not buy fake reviews, impersonate a student or retaliate against a lawful complaint. We may investigate and remove unlawful or misleading material, give reasons where appropriate and allow a correction or review request. Report an intellectual-property concern with the affected URL, the claimed right, your authority and contact information so we can assess it fairly."
        }
      ]
    },
    {
      "id": "conduct",
      "title": "12 Acceptable use and platform decisions",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Do not access another account without authority, bypass access controls, interfere with systems, upload harmful content, commit fraud, scrape personal records or overload the service. Do not exploit a security issue to obtain other people's information. Report an issue through our official contact and describe it without unnecessarily exposing personal data."
        },
        {
          "type": "paragraph",
          "text": "We may restrict an account or listing on reasonable grounds of fraud, serious safety risk, unlawful activity, loss of letting authority or a material breach. Urgent protective action may be taken before a full investigation. Where lawful and appropriate, we will explain the decision, allow a response and review mistakes. Less serious remediable issues should receive a proportionate opportunity to be corrected."
        },
        {
          "type": "paragraph",
          "text": "Suspending platform access does not authorise eviction, automatically end a tenancy or remove statutory rights. We must consider active bookings, communication routes and access to records when applying restrictions. Any significant decision made solely by automated processing must satisfy the applicable privacy rules and reconsideration process. The AI support assistant cannot approve bookings, change an account or decide a tenancy dispute."
        }
      ]
    },
    {
      "id": "liability",
      "title": "13 Service limits and responsibility",
      "blocks": [
        {
          "type": "paragraph",
          "text": "We will exercise the care and skill required by applicable law in the services we undertake. We cannot promise continuous availability, a particular search result, occupancy, rent recovery or another party's performance. Maintenance, network faults and third-party outages may affect access; retain copies of important records and use an alternative contact route when necessary."
        },
        {
          "type": "paragraph",
          "text": "Each party remains responsible for its own breach, negligence, fraud and legal duties. The landlord remains responsible for the accommodation and tenancy; Akolet remains responsible for its own services and representations. Nothing in these terms excludes liability or remedies that cannot lawfully be excluded, excuses fraud or deliberate wrongdoing, or waives mandatory consumer, privacy or tenancy protections. No broad consumer indemnity or nominal liability cap is imposed by this draft. Any negotiated B2B allocation requires separate legal review."
        }
      ]
    },
    {
      "id": "electronic-records",
      "title": "14 Electronic records and notices",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Contracts and records may be made electronically where applicable law permits. A click or typed or drawn signature is not automatically conclusive proof of identity, authority or a compliant tenancy. We must preserve the accepted document version, party and authority information, relevant authentication, timestamp and integrity evidence, and make the completed record available to the parties."
        },
        {
          "type": "paragraph",
          "text": "The current contractual language is English. Before concluding an online transaction, the workflow must explain the steps, error-correction opportunity, whether the record is filed, how it can be accessed and how to store or reproduce the terms. Where law requires a different form, signature, registration or service method, that requirement prevails. Messages through the platform are not automatically a valid substitute for statutory tenancy notices."
        },
        {
          "type": "paragraph",
          "text": "Operational notices may be delivered through the platform or the contact channel supplied for the relevant service. Promotional messages need a separate lawful basis and an effective opt-out. Keep your contact details current. Formal notices to Akolet must use the verified service address and other methods required by law; the address must be completed before publication."
        }
      ]
    },
    {
      "id": "complaints",
      "title": "15 Complaints disputes and governing law",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Contact info@akolet.co.ug with the property or transaction reference and relevant facts. We will acknowledge and investigate platform complaints and explain an appropriate next step. The proposed internal target is acknowledgement within two working days and a substantive response or progress update within 14 calendar days; these service targets require staffing approval and do not replace shorter statutory deadlines."
        },
        {
          "type": "paragraph",
          "text": "The parties may agree to mediation. Ugandan law governs these terms, and disputes may be brought before a competent Ugandan court, subject to mandatory law. You do not lose the right to urgent relief, a statutory complaint, a regulator or another legally available forum because an internal process is offered. Privacy complaints may be made directly to the Personal Data Protection Office at https://pdpo.go.ug."
        }
      ]
    },
    {
      "id": "changes",
      "title": "16 Changes hierarchy and ending use",
      "blocks": [
        {
          "type": "paragraph",
          "text": "We will publish a version and effective date for these terms, keep earlier versions accessible and give suitable notice of material changes. New charges or materially different services require the appropriate affirmative agreement. A website update does not retrospectively alter a completed transaction, signed landlord agreement or tenancy, or supply a missing privacy consent."
        },
        {
          "type": "paragraph",
          "text": "Mandatory law prevails. The landlord and student tenancy agreement governs their accommodation relationship, subject to that law. A separately signed Akolet landlord service agreement governs the particular B2B services and fees; it must identify any incorporated document and conflict order. These public terms govern use of the platform within that framework. The Privacy Policy explains data processing and is not an unlimited permission to use information."
        },
        {
          "type": "paragraph",
          "text": "You may stop using CampusHomes and request account closure. Existing liabilities, lawful record retention and independent tenancy obligations must be handled appropriately. Closure is not automatic cancellation of a tenancy or a waiver of a refund or privacy request. Contact our team if an active booking or unresolved issue needs a continued communication route."
        }
      ]
    },
    {
      "id": "research",
      "title": "Research basis",
      "blocks": [
        {
          "type": "paragraph",
          "text": "The accompanying report identifies the Ugandan Electronic Transactions Act and Regulations, Electronic Signatures Act, Contracts Act, Landlord and Tenant Act, privacy framework and current legal-status issues considered in this draft. DigsConnect was used as a subject-coverage reference; its South African law, subscriptions, payment arrangements and risk clauses have not been transplanted into these terms."
        },
        {
          "type": "list",
          "items": [
            "[Electronic Transactions Act from the ICT Ministry](https://ict.go.ug/site/documents/UGANDA-Electronic-Transactions-Act-No.-8-of-2011.pdf)",
            "[Electronic Transactions Regulations from the ICT Ministry](https://ict.go.ug/public/site/documents/Electronic-Transction-Regulations-SI-42-of-2013.pdf)",
            "[Electronic Signatures Act from the ICT Ministry](https://ict.go.ug/site/documents/UGANDA-Electronic-Signatures-Act-No.-7-of-2011.pdf)",
            "[Landlord and Tenant Act from Parliament](https://bills.parliament.ug/attachments/The%20Landlord%20and%20Tenant%20Act%2C%202022.pdf)",
            "[Contracts Act searchable text](https://ulii.org/akn/ug/act/2010/7/~part_IV__sec_28)"
          ]
        }
      ]
    }
  ]
};

