"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  ClipboardCheck,
  FileCheck2,
  Eye,
  KeyRound,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

type StageKind =
  | "open"
  | "search"
  | "account"
  | "reserve"
  | "message"
  | "confirm"
  | "move"
  | "enjoy";

type Stage = {
  number: string;
  label: string;
  title: string;
  body: string;
  note: string;
  actionLabel: string;
  actionHref: string;
  kind: StageKind;
};

const STAGES: readonly Stage[] = [
  {
    number: "01",
    label: "Open CampusHomes",
    title: "Begin with a calmer first screen.",
    body: "Open CampusHomes and start with the place you know. The search is built to help you compare inspected student housing around campus.",
    note: "Start with the search when you are ready to compare rooms.",
    actionLabel: "Open the search",
    actionHref: "/search",
    kind: "open",
  },
  {
    number: "02",
    label: "Search hostels",
    title: "Compare the details that matter.",
    body: "Search by campus or area, then look closely at photos, room arrangements, availability and inspection context. You can contact a landlord or arrange a viewing before you reserve.",
    note: "Open a listing for the full room details before you decide.",
    actionLabel: "Search hostels",
    actionHref: "/search",
    kind: "search",
  },
  {
    number: "03",
    label: "Create an account",
    title: "Keep your choices in one place.",
    body: "Create a student account to save hostels, message and manage reservations. Sign-in is required before you reserve a room.",
    note: "Create an account when you want to save, message or reserve.",
    actionLabel: "Create an account",
    actionHref: "/sign-in",
    kind: "account",
  },
  {
    number: "04",
    label: "Reserve",
    title: "Hold a room while you make the next decision.",
    body: "When a room is right for you, sign in and reserve it for free. The exact reservation expiry is shown in your account, so you always know what the hold means.",
    note: "Your reservation shows the exact expiry.",
    actionLabel: "Sign in to reserve",
    actionHref: "/sign-in?next=%2Fsearch",
    kind: "reserve",
  },
  {
    number: "05",
    label: "Message landlord",
    title: "Ask the question that helps you decide.",
    body: "Keep the conversation close to the room you are considering. Contact and viewings can happen before you reserve, so you can ask about the terms and see the space for yourself.",
    note: "Ask about viewing times and tenancy terms before you reserve.",
    actionLabel: "Find a hostel to message",
    actionHref: "/search",
    kind: "message",
  },
  {
    number: "06",
    label: "Confirm booking",
    title: "Agree the terms, then request booking.",
    body: "After you agree the tenancy terms, My reservations shows Request booking. The landlord confirms the booking there. CampusHomes does not collect your rent.",
    note: "Request booking after you agree the tenancy terms.",
    actionLabel: "Open My reservations",
    actionHref: "/reservations",
    kind: "confirm",
  },
  {
    number: "07",
    label: "Move in",
    title: "Arrive with the important part settled.",
    body: "Once your booking is confirmed, agree the practical move-in details with the landlord. Pay the landlord directly, then use Confirm move-in when the booked room is yours.",
    note: "Confirm move-in after the landlord confirms your booking.",
    actionLabel: "Read safety guidance",
    actionHref: "/safety",
    kind: "move",
  },
  {
    number: "08",
    label: "Enjoy your room",
    title: "Make space for the semester ahead.",
    body: "With move-in confirmed, your CampusHomes journey has done its job: helping you find a room, understand the terms and arrive with a clear record of what was agreed.",
    note: "Keep your booking record nearby when you need it.",
    actionLabel: "View your reservations",
    actionHref: "/reservations",
    kind: "enjoy",
  },
] as const;

function PreviewBrowserChrome() {
  return (
    <div className="ch-journey-preview__browser-chrome" aria-hidden="true">
      <span className="ch-journey-preview__traffic"><i /><i /><i /></span>
      <span className="ch-journey-preview__address">campushomes.co.ug</span>
      <span className="ch-journey-preview__browser-menu"><ChevronDown /></span>
    </div>
  );
}

function PreviewPhoneChrome() {
  return (
    <div className="ch-journey-preview__phone-chrome" aria-hidden="true">
      <span />
      <span className="ch-journey-preview__phone-camera" />
      <span />
    </div>
  );
}

function PreviewHeader({ compact = false }: { compact?: boolean }) {
  return (
    <div className="ch-preview-ui__header">
      <span className="ch-preview-ui__brand"><Image src="/images/branding/campushomes-mark.png" alt="" width={16} height={16} /><b>CampusHomes</b></span>
      {!compact && <span className="ch-preview-ui__header-links"><i>Search</i><i>How it works</i><i>Sign in</i></span>}
      {compact && <span className="ch-preview-ui__header-menu"><i /><i /><i /></span>}
    </div>
  );
}

function PreviewArt({ kind, compact = false }: { kind: StageKind; compact?: boolean }) {
  if (kind === "open") {
    return (
      <div className="ch-preview-art ch-preview-art--open">
        <PreviewHeader compact={compact} />
        <div className="ch-preview-open__content">
          <div className="ch-preview-open__copy">
            <span className="ch-preview-ui__eyebrow">STUDENT HOUSING NEAR CAMPUS</span>
            <strong>Find your hostel near Makerere.</strong>
            <span className="ch-preview-ui__subtle">Compare inspected rooms and choose your next step.</span>
            <span className="ch-preview-ui__search"><Search /><span>Search by campus, area or hostel</span><ArrowRight /></span>
          </div>
          <div className="ch-preview-open__photo">
            <Image src="/images/campushomes/hero-hostel-hd-v2.webp" alt="" fill sizes="(min-width: 900px) 30vw, 78vw" />
            <span>Inspected context</span>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "search") {
    return (
      <div className="ch-preview-art ch-preview-art--search">
        <PreviewHeader compact={compact} />
        <div className="ch-preview-search__toolbar">
          <strong>Search hostels</strong>
          <span className="ch-preview-ui__chip"><MapPin /> Makerere</span>
          <span className="ch-preview-ui__filter">Filters <span>3</span></span>
        </div>
        <div className="ch-preview-search__body">
          <div className="ch-preview-search__results">
            <div className="ch-preview-ui__result-count">Published room details</div>
            <div className="ch-preview-result-card">
              <div className="ch-preview-result-card__image"><Image src="/images/campushomes/student-room-card.webp" alt="" fill sizes="(min-width: 900px) 16vw, 60vw" /></div>
              <div><b>Room details</b><span><CheckCircle2 /> Inspected context</span><small>Availability and terms shown in the listing</small></div>
            </div>
            <div className="ch-preview-result-card ch-preview-result-card--muted">
              <div className="ch-preview-result-card__image"><Image src="/images/campushomes/makerere-campus-hd-v2.webp" alt="" fill sizes="(min-width: 900px) 16vw, 60vw" /></div>
              <div><b>Compare another option</b><span><MapPin /> Nearby area</span><small>Open a listing to see its full details</small></div>
            </div>
          </div>
          <div className="ch-preview-map"><span className="ch-preview-map__label">Map view</span><i /><i /><i /><i /><span className="ch-preview-map__pin"><MapPin /></span></div>
        </div>
      </div>
    );
  }

  if (kind === "account") {
    return (
      <div className="ch-preview-art ch-preview-art--account">
        <PreviewHeader compact={compact} />
        <div className="ch-preview-account__body">
          <div className="ch-preview-account__icon"><CircleUserRound /></div>
          <span className="ch-preview-ui__eyebrow">YOUR CAMPUSHOMES ACCOUNT</span>
          <strong>{compact ? "Create account" : "Create your account"}</strong>
          <span className="ch-preview-ui__subtle">{compact ? "Save and reserve with one account." : "Save hostels and keep reservations together."}</span>
          <div className="ch-preview-form-row"><UserRound /><span>Student email</span></div>
          <div className="ch-preview-form-row"><ShieldCheck /><span>Secure sign-in</span></div>
          <span className="ch-preview-ui__button">Continue <ArrowRight /></span>
          {!compact && <span className="ch-preview-account__foot">Already have an account? Sign in</span>}
        </div>
      </div>
    );
  }

  if (kind === "reserve") {
    return (
      <div className="ch-preview-art ch-preview-art--reserve">
        <PreviewHeader compact={compact} />
        <div className="ch-preview-reserve__body">
          <div className="ch-preview-room-image"><Image src="/images/campushomes/student-room-hd-v2.webp" alt="" fill sizes="(min-width: 900px) 30vw, 78vw" /><span>Room preview</span></div>
          <div className="ch-preview-reserve__copy"><span className="ch-preview-ui__eyebrow">ROOM DETAILS</span><strong>Choose with context.</strong><span className="ch-preview-ui__subtle">Review the room, terms and availability before you reserve.</span></div>
          <div className="ch-preview-reserve__facts"><span><CheckCircle2 /> Availability shown</span><span><ShieldCheck /> Inspection context</span></div>
          <span className="ch-preview-ui__button ch-preview-ui__button--wide">Reserve for free <ArrowRight /></span>
          <span className="ch-preview-ui__helper"><KeyRound /> Sign in required to reserve</span>
        </div>
      </div>
    );
  }

  if (kind === "message") {
    return (
      <div className="ch-preview-art ch-preview-art--message">
        <PreviewHeader compact={compact} />
        <div className="ch-preview-message__body">
          <div className="ch-preview-message__title"><span className="ch-preview-ui__avatar"><Building2 /></span><span><b>Message landlord</b><small>{compact ? "Ask before reserving" : "Keep questions with the listing"}</small></span><MessageCircle /></div>
          <div className="ch-preview-message__thread">
            <span className="ch-preview-bubble ch-preview-bubble--student">{compact ? "Can I view first?" : "Could I view the room before reserving?"}</span>
            <span className="ch-preview-bubble ch-preview-bubble--landlord">{compact ? "Ask about the terms." : "Ask about the terms and arrange a viewing directly."}</span>
            <span className="ch-preview-message__viewing"><EyeIcon />{compact ? "View before reserving" : "Contact and viewings can happen first."}</span>
          </div>
          <div className="ch-preview-message__input"><span>Write a message</span><ArrowRight /></div>
        </div>
      </div>
    );
  }

  if (kind === "confirm") {
    return (
      <div className="ch-preview-art ch-preview-art--confirm">
        <PreviewHeader compact={compact} />
        <div className="ch-preview-confirm__body">
          <div className="ch-preview-confirm__top"><span><ClipboardCheck /></span><span><b>My reservations</b><small>{compact ? "Booking status" : "Keep the status of your request in view"}</small></span></div>
          <div className="ch-preview-confirm__steps"><span className="is-done"><Check /> {compact ? "Held" : "Reservation held"}</span><span className="is-done"><Check /> {compact ? "Terms" : "Terms agreed"}</span><span className="is-current"><span>3</span> {compact ? "Request" : "Request booking"}</span><span><span>4</span> {compact ? "Confirm" : "Landlord confirms"}</span></div>
          <div className="ch-preview-confirm__request"><span><FileCheck2 /><b>{compact ? "Ready?" : "Ready to request booking?"}</b><small>{compact ? "Terms agreed" : "Request after you agree the tenancy terms."}</small></span><span className="ch-preview-ui__button">{compact ? "Request" : "Request booking"} <ArrowRight /></span></div>
          {!compact && <span className="ch-preview-ui__helper"><WalletCards /> Pay the landlord directly; CampusHomes does not collect rent.</span>}
        </div>
      </div>
    );
  }

  if (kind === "move") {
    return (
      <div className="ch-preview-art ch-preview-art--move">
        <PreviewHeader compact={compact} />
        <div className="ch-preview-move__body">
          <div className="ch-preview-move__heading"><span className="ch-preview-ui__eyebrow">BOOKED RESERVATION</span><strong>{compact ? "Move in" : "Move-in checklist"}</strong><span className="ch-preview-ui__subtle">{compact ? "After booking confirmation." : "Complete this step after the landlord confirms your booking."}</span></div>
          <div className="ch-preview-move__list"><span className="is-done"><CheckCircle2 /> {compact ? "Booked" : "Booking confirmed"}</span><span className="is-done"><CheckCircle2 /> {compact ? "Paid directly" : "Pay landlord directly"}</span><span className="is-current"><KeyRound /> {compact ? "Confirm" : "Confirm move-in"}</span></div>
          <span className="ch-preview-ui__button ch-preview-ui__button--wide">{compact ? "Confirm" : "Confirm move-in"} <ArrowRight /></span>
          {!compact && <span className="ch-preview-ui__helper"><ShieldCheck /> Available only for a booked reservation</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="ch-preview-art ch-preview-art--enjoy">
      <PreviewHeader compact={compact} />
      <div className="ch-preview-enjoy__body">
        <div className="ch-preview-enjoy__photo"><Image src="/images/campushomes/student-lounge-hd-v2.webp" alt="" fill sizes="(min-width: 900px) 30vw, 78vw" /><span>Room and shared space preview</span></div>
        <div className="ch-preview-enjoy__content"><span className="ch-preview-ui__eyebrow">MOVE-IN CONFIRMED</span><strong>Make space for the semester.</strong><span className="ch-preview-ui__subtle">Your booking and move-in record stay together when you need them.</span><div className="ch-preview-enjoy__badge"><Sparkles /> Your next chapter starts here.</div></div>
      </div>
    </div>
  );
}

function EyeIcon() {
  return <Eye aria-hidden="true" />;
}

function StagePreview({ stage }: { stage: Stage }) {
  return (
    <div className="ch-journey-previews" role="img" aria-label={`Illustrative desktop and phone previews: ${stage.label}`}>
      <div className="ch-journey-preview-card ch-journey-preview-card--desktop">
        <div className="ch-journey-preview-card__label"><span>Desktop preview</span><span>Illustrative</span></div>
        <div className="ch-journey-preview__browser"><PreviewBrowserChrome /><PreviewArt kind={stage.kind} /></div>
      </div>
      <div className="ch-journey-preview-card ch-journey-preview-card--phone">
        <div className="ch-journey-preview-card__label"><span>Phone preview</span><span>Illustrative</span></div>
        <div className="ch-journey-preview__phone"><PreviewPhoneChrome /><PreviewArt kind={stage.kind} compact /></div>
      </div>
    </div>
  );
}

export default function JourneyShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const stage = STAGES[activeIndex];

  function selectStage(index: number, moveFocus = false) {
    const nextIndex = (index + STAGES.length) % STAGES.length;
    setActiveIndex(nextIndex);
    if (moveFocus) tabRefs.current[nextIndex]?.focus();
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const current = activeIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectStage(current + 1, true);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectStage(current - 1, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectStage(0, true);
    } else if (event.key === "End") {
      event.preventDefault();
      selectStage(STAGES.length - 1, true);
    }
  }

  return (
    <section className="ch-journey-showcase" aria-labelledby="journey-showcase-heading">
      <div className="ch-journey-showcase__inner">
        <div className="ch-journey-showcase__heading">
          <p className="ch-journey-eyebrow ch-journey-eyebrow--dark">Explore each moment</p>
          <h2 id="journey-showcase-heading">A product tour you can take at your pace.</h2>
        </div>

        <div className="ch-journey-experience">
          <div className="ch-journey-tabs-wrap">
            <p className="ch-journey-tabs__hint" id="journey-tabs-hint">Select a step</p>
            <div className="ch-journey-tabs" role="tablist" aria-label="CampusHomes journey steps" aria-describedby="journey-tabs-hint">
              {STAGES.map((item, index) => (
                <button
                  key={item.number}
                  ref={(element) => { tabRefs.current[index] = element; }}
                  type="button"
                  role="tab"
                  id={`journey-tab-${item.number}`}
                  aria-controls={`journey-panel-${item.number}`}
                  aria-selected={activeIndex === index}
                  aria-label={`${item.number} ${item.label}`}
                  tabIndex={activeIndex === index ? 0 : -1}
                  className={`ch-journey-tab${activeIndex === index ? " is-selected" : ""}`}
                  onClick={() => selectStage(index)}
                  onKeyDown={onTabKeyDown}
                >
                  <span className="ch-journey-tab__number">{item.number}</span>
                  <span className="ch-journey-tab__label">{item.label}</span>
                  <span className="ch-journey-tab__indicator" aria-hidden="true"><ArrowRight /></span>
                </button>
              ))}
            </div>
            <div className="ch-journey-tabs__controls" aria-label="Journey step controls">
              <button type="button" onClick={() => selectStage(activeIndex - 1, true)} aria-label="Previous journey step"><ArrowLeft /></button>
              <span className="tabular">{stage.number} / 08</span>
              <button type="button" onClick={() => selectStage(activeIndex + 1, true)} aria-label="Next journey step"><ArrowRight /></button>
            </div>
          </div>

          <div
            key={stage.number}
            className="ch-journey-panel"
            id={`journey-panel-${stage.number}`}
            role="tabpanel"
            aria-labelledby={`journey-tab-${stage.number}`}
            tabIndex={0}
          >
            <div className="ch-journey-panel__content">
              <div className="ch-journey-panel__copy">
                <div className="ch-journey-panel__stage"><span>{stage.number}</span><span>Selected stage</span></div>
                <h3>{stage.title}</h3>
                <p>{stage.body}</p>
                <div className="ch-journey-panel__action-row">
                  <p className="ch-journey-panel__note"><ShieldCheck aria-hidden="true" />{stage.note}</p>
                  <Link href={stage.actionHref} className="ch-journey-button ch-journey-button--dark">
                    {stage.actionLabel} <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              </div>
              <StagePreview stage={stage} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
