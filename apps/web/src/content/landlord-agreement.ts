// Landlord agreement Proposed V3 (Akolet, 28 October 2026) as a web draft:
// typos fixed, fill-in fields kept as blanks. Not signable through this page.
import type { LegalDocument } from "./legal-documents";

export const landlordAgreement: LegalDocument = {
  "title": "Landlord agreement",
  "kind": "landlord-agreement",
  "version": "CH LA 2026 10 D3",
  "prepared": "28 October 2026",
  "sections": [
    {
      "id": "about",
      "title": "About this agreement",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Akolet Properties Ltd operates CampusHomes. Akolet Properties Ltd is referred to here as we, us or Akolet. This agreement covers the Landlord's student accommodation listing, verification, enquiries and booking services."
        },
        {
          "type": "paragraph",
          "text": "Complete every field before signing. Use None or 0, and DD/MM/YYYY for dates."
        }
      ]
    },
    {
      "id": "parties",
      "title": "1 Parties",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Akolet Properties Ltd is registered with the Uganda Registration Services Bureau, registration number 80034439190764."
        },
        {
          "type": "paragraph",
          "text": "Akolet notice contacts: email info@akolet.co.ug, phone +256 732 152 211."
        },
        {
          "type": "list",
          "items": [
            "Landlord legal name: ______________",
            "Registration number if a company: ______________",
            "Landlord postal/physical address: ______________",
            "Landlord’s notice email and telephone: ______________",
            "Authorised representative and role if applicable: ______________"
          ]
        },
        {
          "type": "paragraph",
          "text": "Name the person or company legally entitled to let the property as the Landlord. A representative must have written authority to sign for that party."
        }
      ]
    },
    {
      "id": "property",
      "title": "2 Property and term",
      "blocks": [
        {
          "type": "list",
          "items": [
            "Property or hostel name: ______________",
            "Physical address and location: ______________",
            "Rooms or units covered and number of beds: ______________",
            "Start date ____ / ____ / ______ End date if fixed ____ / ____ / ______"
          ]
        },
        {
          "type": "paragraph",
          "text": "Without a fixed end date, the agreement continues until ended under clause 10. A free trial ends on the date in clause 7 and does not convert to a paid service without written agreement."
        }
      ]
    },
    {
      "id": "services",
      "title": "3 Agreed services",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Akolet through CampusHomes will prepare and publish approved listings, carry out the verification agreed below, and support student enquiries, viewing arrangements and booking communication. The appointment is non-exclusive; the Landlord may use other channels."
        },
        {
          "type": "list",
          "items": [
            "Additional tools or services included: ______________"
          ]
        }
      ]
    },
    {
      "id": "standards",
      "title": "4 Listing and landlord standards",
      "blocks": [
        {
          "type": "paragraph",
          "text": "The Landlord confirms lawful authority to advertise and let the rooms, supplies reasonable identity and authority evidence, and obtains any permissions required for the accommodation. The Landlord will tell Akolet promptly if that authority changes."
        },
        {
          "type": "paragraph",
          "text": "The Landlord will provide accurate photographs, room descriptions, location, facilities, house rules, rent, deposits and all mandatory charges. Utilities and optional charges must be distinguished. The Landlord will approve the listing before publication and update availability or material changes within 24 hours of becoming aware of them."
        },
        {
          "type": "paragraph",
          "text": "The Landlord will provide accommodation as described, maintain it in a lawful and habitable condition, attend to repairs, and comply with Uganda's Landlord and Tenant Act 2022, including applicable rules on deposits, receipts, advance rent, access, notices and eviction."
        },
        {
          "type": "paragraph",
          "text": "The Landlord will respond to enquiries within two working days, treat students fairly, and avoid unlawful discrimination, harassment, misleading claims, hidden fees, bribery and fake reviews. CampusHomes will apply its listing standards fairly and correct confirmed errors promptly."
        }
      ]
    },
    {
      "id": "verification",
      "title": "5 Verification and marketing",
      "blocks": [
        {
          "type": "list",
          "items": [
            "Agreed checks: ☐ Identity and authority ☐ Listing information ☐ Property visit",
            "Other checks or limits: ______________"
          ]
        },
        {
          "type": "paragraph",
          "text": "CampusHomes will use reasonable care, record what was checked and when, and explain the limits of any verification label. Verification is not a structural survey, title certification or a guarantee of safety, occupancy, rent payment or tenant conduct. Payment for a check does not guarantee approval."
        },
        {
          "type": "paragraph",
          "text": "The Landlord gives Akolet through CampusHomes a non-exclusive licence to use supplied descriptions and images to advertise this property during the agreement and confirms permission to use them. Akolet will seek approval for material changes and label paid promotion. Ownership of the original material remains with its owner."
        },
        {
          "type": "paragraph",
          "text": "Verifications are valid for 24 months or until major structural changes are implemented, whichever occurs first. After that, a re-inspection or re-verification may be required."
        }
      ]
    },
    {
      "id": "bookings",
      "title": "6 Bookings and tenancy",
      "blocks": [
        {
          "type": "paragraph",
          "text": "A reservation or an enquiry is not a confirmed booking. Before confirmation, the Landlord will confirm the available room, complete price, move-in date and written cancellation terms. CampusHomes will communicate those terms accurately and retain the confirmation record. Neither party may substitute a room or add a charge without the student's agreement."
        },
        {
          "type": "paragraph",
          "text": "The Landlord and student enter their own tenancy agreement. CampusHomes and its parent company Akolet Properties Ltd are not made the landlord, property manager or guarantor by this agreement and have no authority to sign a tenancy, change rent or receive rent or deposits for the Landlord with the current service. Any broader appointment or change in terms requires a separate written agreement."
        }
      ]
    },
    {
      "id": "fees",
      "title": "7 Agreed fees",
      "blocks": [
        {
          "type": "list",
          "items": [
            "Subscription or tools plan: ______________; UGX ______________ per month; billing date ______________.",
            "Commission for a successful booking: none, or ______ % of the first month's rent, capped at UGX ______________; due when the tenant completes the booking.",
            "Verification photography: scope ______________; UGX ______________ one-off; due after the agreed work is delivered."
          ]
        },
        {
          "type": "paragraph",
          "text": "Only a completed fee row agreed by both parties authorises a charge. Amounts are in UGX and include applicable taxes unless an additional tax is expressly recorded below. No commission applies unless both parties initial its completed row."
        },
        {
          "type": "list",
          "items": [
            "Free trial or fee waiver ends ____ / ____ / ______ Additional agreed tax ______________"
          ]
        },
        {
          "type": "paragraph",
          "text": "Commission is earned only when a student introduced through a recorded CampusHomes enquiry moves in and pays the first month's rent. Deposits, utilities, renewals and the Landlord's own leads are excluded. Cancelled bookings and failed move-ins attract no commission. Optional work requires a signed quotation; fee changes require both parties' written agreement."
        }
      ]
    },
    {
      "id": "payments",
      "title": "8 Payments cancellations and refunds",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Rent and deposits are paid directly to the Landlord, who issues receipts and handles tenancy refunds. CampusHomes invoices its agreed fees, payable within seven calendar days. Staff must not collect money through personal accounts. Using a licensed payment provider requires a separate signed addendum covering the provider, charges, any custody, settlement and refunds. Please see the separate addendum for official payment channels to Akolet or CampusHomes."
        },
        {
          "type": "paragraph",
          "text": "For an unavailable or materially misdescribed room, the Landlord must promptly provide a remedy accepted by the student or refund the affected payment. Other cancellations follow the lawful policy disclosed before confirmation. CampusHomes will reverse unearned commission and refund its own refundable charges."
        }
      ]
    },
    {
      "id": "personal-data",
      "title": "9 Personal data and accounts",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Both parties will comply with Uganda's Data Protection and Privacy Act 2019. Akolet provides a privacy notice, currently in draft, which the Landlord reviews during onboarding. It explains data use, recipients, retention, rights and complaints. Identity documents will not be published. Each party will limit access and sharing to lawful needs, protect credentials and report suspected misuse promptly. Unrelated marketing requires a separate lawful basis."
        }
      ]
    },
    {
      "id": "ending",
      "title": "10 Ending or suspending services",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Either party may end this agreement on 14 calendar days' written notice to the contact in clause 1, or if a remediable breach remains uncorrected seven calendar days after written notice."
        },
        {
          "type": "paragraph",
          "text": "Akolet through CampusHomes may suspend a listing immediately on reasonable grounds of suspected fraud, serious safety concerns, invalid letting authority or unlawful conduct. It will explain its reasons unless prohibited by law and consider the Landlord's response. Serious or repeated breaches may lead to termination."
        },
        {
          "type": "paragraph",
          "text": "On ending, Akolet through CampusHomes will remove the listing and stop new bookings. Existing tenancies and confirmed bookings continue unless lawfully cancelled. The parties will settle earned fees, refund unused prepaid subscriptions proportionately within 14 working days, and retain or delete records as law requires. This does not evict a student."
        }
      ]
    },
    {
      "id": "disputes",
      "title": "11 Responsibility and disputes",
      "blocks": [
        {
          "type": "paragraph",
          "text": "Each party remains responsible for its breach, negligence, fraud and legal duties: the Landlord for the accommodation and tenancy, and CampusHomes for its agreed services. Liability that cannot lawfully be excluded remains."
        },
        {
          "type": "paragraph",
          "text": "Send complaints and notices to the contacts in clause 1. The parties will seek resolution within 14 calendar days of receipt, then may agree to mediation or use a competent Ugandan court. Ugandan law governs. Urgent legal relief and statutory complaint rights remain available."
        },
        {
          "type": "paragraph",
          "text": "This agreement and identified signed attachments record the terms. Changes require authorised representatives' written agreement; website updates do not amend them."
        },
        {
          "type": "list",
          "items": [
            "Signed attachments if any: ______________"
          ]
        }
      ]
    },
    {
      "id": "signatures",
      "title": "12 Signatures",
      "blocks": [
        {
          "type": "paragraph",
          "text": "In accordance with the Electronic Transactions Act, 2011 of Uganda, electronic signatures and electronic acceptance through the CampusHomes portal, including acceptance by clicking, shall have the same legal effect as handwritten signatures. Akolet through CampusHomes may require the parties to execute this agreement using any legally valid form of signature that it considers appropriate."
        },
        {
          "type": "paragraph",
          "text": "Each signatory confirms understanding of the terms, completion of the details and fees, and authority to bind the named party. Each party will receive a complete signed copy."
        },
        {
          "type": "list",
          "items": [
            "For the Landlord or authorised representative: name, role or capacity, signature and date.",
            "For Akolet Properties Ltd, operating CampusHomes: name, role or capacity, signature and date."
          ]
        }
      ]
    }
  ]
};
