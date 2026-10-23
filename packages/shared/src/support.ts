import { z } from 'zod';

import { MAX_ACTIVE_RESERVATIONS } from './reservation.js';

// One source for the support page's FAQ + user manual and the text the
// CampusHomes AI answers from, so the assistant can't drift from the docs.

export type SupportFaq = { question: string; answer: string };

export const SUPPORT_FAQS: SupportFaq[] = [
  {
    question: 'How much does it cost to reserve a room?',
    answer: 'Reserving a room is free while the platform grows.',
  },
  {
    question: 'What is the difference between reserving and booking?',
    answer:
      'Reserving holds a bed for you for 6 hours, for free, while you view the room and agree terms with the landlord. It is not final: you can cancel it, and it ends on its own if the 6 hours run out. Booking makes the bed yours. After you agree terms, you tap Request booking in My reservations and the landlord confirms it. A booking does not expire, only the landlord can release it, and rent is paid to the landlord directly.',
  },
  {
    question: 'How long is a room held for me?',
    answer:
      '6 hours from the moment you reserve. My reservations shows the time left. If the hold runs out, it ends on its own and the bed goes back on the list for other students.',
  },
  {
    question: 'How many rooms can I reserve at once?',
    answer: `Up to ${MAX_ACTIVE_RESERVATIONS}, and one of each room type per hostel, counting both rooms on hold and rooms your landlord has confirmed. Cancel a hold you no longer want to free a slot. A confirmed booking can only be released by the landlord; contact support if you need help reaching them.`,
  },
  {
    question: 'How do I book a room?',
    answer:
      'Reserve it first (free). After you have viewed it and agreed terms with the landlord, open My reservations and tap Request booking. The landlord then confirms your booking.',
  },
  {
    question: 'Do I pay rent through CampusHomes?',
    answer:
      'No. Rent, deposits and tenancy agreements stay directly between you and the landlord, paid the way you agree with them. CampusHomes does not collect or mark up your rent.',
  },
  {
    question: 'Can I see the room before I reserve?',
    answer:
      'Yes. Sign in, open the listing and choose Request a viewing to ask the landlord for a time that suits you both.',
  },
  {
    question: 'What does Verified actually mean?',
    answer:
      'A CampusHomes inspector physically visited the property and confirmed location, rooms, amenities, photos, landlord identity and safety before publication.',
  },
  {
    question: 'Can I cancel a reservation?',
    answer:
      'A room on hold, yes: cancel it any time from My reservations. You confirm first, and the bed is released straight away. Once the landlord has confirmed your booking, only they can release it; contact support if you need help reaching them.',
  },
  {
    question: 'How do I get help?',
    answer:
      'Open Support. Ask CampusHomes AI for a quick answer, chat with our team on WhatsApp, or, once signed in as a student, send us a message and attach one of your reservations so we know which one you mean.',
  },
];

export const SUPPORT_MANUAL_SECTION_IDS = [
  'getting-started',
  'finding-a-room',
  'listing-page',
  'reserving',
  'booking',
  'dashboard',
  'messages',
  'profile',
  'landlords',
  'safety',
  'troubleshooting',
] as const;
export type SupportManualSectionId = (typeof SUPPORT_MANUAL_SECTION_IDS)[number];

export type SupportManualSection = {
  id: SupportManualSectionId;
  title: string;
  steps: string[];
};

export const SUPPORT_MANUAL: SupportManualSection[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    steps: [
      'CampusHomes lists student hostels near Makerere University. Every hostel is inspected in person by our team before it is listed.',
      'You can search and open listings without an account. To reserve, message a landlord or save favourites, tap Sign in, then Create an account.',
      'Sign up with your email or phone number and the one-time code we send you.',
      'After signing up you are asked to complete your profile, including a contact phone number. Landlords and our team use this number to reach you.',
    ],
  },
  {
    id: 'finding-a-room',
    title: 'Finding a room',
    steps: [
      'Open Find a room. The map and the list show verified hostels; move or zoom the map to search a different area.',
      'Type a hostel name or area in the search box, or narrow the list by price, gender (Male only, Female only, Mixed), room type (Single, Double, Triple, Quad, Studio, Bedsitter) and bathroom (Self-contained or Not self-contained).',
      'Clear filters resets every filter at once.',
      'Each card shows the starting price, how many rooms still have a free bed and how many beds are free.',
      'Tap the heart on a listing to save it to Favourites. Recently viewed keeps the places you opened.',
    ],
  },
  {
    id: 'listing-page',
    title: 'Reading a listing',
    steps: [
      'The Verified badge and the "Inspected" date show when our inspector visited.',
      'Photos come from the inspection and from the landlord. Room photos opens the photos for one room type.',
      'Each room type shows its price per bed per semester, how many people share a room, how many rooms still have a free bed, and how many beds are free.',
      'Check amenities, house rules, who can stay (gender) and other charges such as a deposit or advance rent before you reserve.',
      'Request a viewing asks the landlord for a time to see the room. Ask about this place sends the landlord a question. Neither needs a reservation.',
    ],
  },
  {
    id: 'reserving',
    title: 'Reserving a room',
    steps: [
      'Reserving is free. Choose a room type on the listing and tap Reserve; we hold one bed of that type for you for 6 hours.',
      `You can have up to ${MAX_ACTIVE_RESERVATIONS} live reservations at once, and only one of each room type per hostel.`,
      'A popup confirms the hostel, room type and when the hold ends. The room type then shows a yellow Reserved button.',
      'My reservations shows a countdown. If the 6 hours run out, the hold ends on its own and the bed is offered to other students.',
      'Changed your mind? Cancel the hold from My reservations to free the bed and your slot.',
    ],
  },
  {
    id: 'booking',
    title: 'Booking a room',
    steps: [
      'A reservation is not final. View the room and agree the rent, deposit and terms with the landlord first.',
      'Then open My reservations and tap Request booking. The landlord gets a notification and confirms your booking.',
      'A confirmed booking does not expire. Only the landlord can release it; contact support if you need help reaching them.',
      'Rent and deposits are paid to the landlord directly, the way you agree with them. CampusHomes does not collect rent.',
      'When you move in, confirm your move-in in My reservations so the room is marked occupied.',
    ],
  },
  {
    id: 'dashboard',
    title: 'My dashboard and reservations',
    steps: [
      'My dashboard (in the account menu and the sidebar) shows your live reservations, when the next hold ends, your favourites, messages and profile.',
      'My reservations lists every reservation with its status and the actions you can take, such as cancel, Request booking or Message.',
    ],
  },
  {
    id: 'messages',
    title: 'Messages',
    steps: [
      'Once you have a reservation, use Message on it to chat with the landlord. Conversations are in Messages.',
      'Keep agreements in writing in the chat so both sides have a record.',
    ],
  },
  {
    id: 'profile',
    title: 'Profile and account',
    steps: [
      'Profile lets you update your personal details: name, date of birth, gender, nationality, address, contact phone and emergency contact.',
      'Sign out from the account menu. Each browser keeps its own sign-in, so signing in on a new device does not sign you out elsewhere.',
    ],
  },
  {
    id: 'landlords',
    title: 'For landlords',
    steps: [
      'Open Sign in, then Landlord sign in, to create a landlord account (new landlords can also start from For landlords).',
      'Complete onboarding: your legal name, an ID document, and your first property with its room types, prices and photos.',
      'Our team reviews your details and inspects the property in person. Once it passes, the listing is published and appears in search.',
      'Manage Rooms keeps prices and free beds up to date. When a student taps Request booking, the bed shows "booking requested"; confirm it with Book.',
      'Messages and Enquiries hold student conversations. Support & Help in your portal reaches our team.',
    ],
  },
  {
    id: 'safety',
    title: 'Safety and verification',
    steps: [
      'Verified means an inspector visited and confirmed the location, rooms, amenities, photos, landlord identity and safety before publication.',
      'Never pay money before you have seen the room and agreed terms with the landlord.',
      'CampusHomes will never ask for your password or sign-in code. Do not share them with anyone.',
      'If a place does not match its listing, or you have a safety concern, contact us with the hostel name and your reservation reference. Our team investigates every report.',
    ],
  },
  {
    id: 'troubleshooting',
    title: 'FAQ and troubleshooting',
    steps: [
      'Did not get a sign-in code? Check your spam folder or that the phone number is correct, wait a minute, then request a new code.',
      `Cannot reserve? You may already have ${MAX_ACTIVE_RESERVATIONS} live reservations, or one of that room type in the same hostel. Cancel a hold you no longer need in My reservations.`,
      'Hold expired? Reserve again if a bed is still free.',
      'A page will not load? Refresh it, check your connection, then contact us if it keeps happening.',
      ...SUPPORT_FAQS.map((faq) => `${faq.question} ${faq.answer}`),
    ],
  },
];

export const supportAskSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(1000),
      }),
    )
    .min(1)
    .max(12)
    .refine((messages) => messages.at(-1)?.role === 'user', 'The last message must be the question.'),
});
export type SupportAskInput = z.infer<typeof supportAskSchema>;

export const supportAskResponseSchema = z.object({ reply: z.string() });
export type SupportAskResponse = z.infer<typeof supportAskResponseSchema>;
