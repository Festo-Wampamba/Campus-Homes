"use client";

import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Building2,
  ClipboardCheck,
  IdCard,
  KeyRound,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";

type SignupStep = {
  icon: LucideIcon;
  who: "You" | "CampusHomes team";
  title: string;
  body: string;
  needs: string[];
  /** What the step looks like for a landlord who only manages (0076). */
  manageOnly?: "skipped" | { title: string; body: string; needs: string[] };
};

type SignupPath = "manage_only" | "list";

// Mirrors the real flow: Logto sign-in → /landlords/enroll → onboarding wizard
// (legal step, property step) → Ops verification → dashboard. Keep in step
// with onboarding-wizard.tsx if a field becomes required or optional.
const SIGNUP_STEPS: SignupStep[] = [
  {
    icon: KeyRound,
    who: "You",
    title: "Create or sign in to your account",
    body: "Use your email or phone number and confirm it with the one-time code we send. Already a student on CampusHomes? Use the same account.",
    needs: ["Email or Ugandan phone number", "Access to it for the code"],
  },
  {
    icon: IdCard,
    who: "You",
    title: "Add landlord access and your details",
    body: "Turn on your landlord workspace, then tell us who owns or runs the property.",
    needs: ["Legal name as on your ID", "Individual or business", "WhatsApp number (optional)"],
  },
  {
    icon: Building2,
    who: "You",
    title: "Submit your property",
    body: "Add the hostel's name and street address, and choose to manage it only or also list it to students. Photos and room prices can be added now or later.",
    needs: ["Property name", "Street address", "Cover photo and room prices (optional)"],
  },
  {
    icon: ClipboardCheck,
    who: "You",
    title: "Confirm five short declarations",
    body: "Confirm the details are accurate, that you own or manage the property, and agree to keep prices and availability current.",
    needs: ["Five tick boxes, read before you confirm"],
    // The consent to publish isn't asked when nothing is published.
    manageOnly: {
      title: "Confirm four short declarations",
      body: "Confirm the details are accurate, that you own or manage the property, and agree to keep prices and availability current.",
      needs: ["Four tick boxes, read before you confirm"],
    },
  },
  {
    icon: BadgeCheck,
    who: "CampusHomes team",
    title: "We verify your property",
    body: "Our operations team reviews your details and arranges a visit. Your dashboard shows the approval status and updates by itself.",
    needs: ["Someone available for the visit"],
    manageOnly: "skipped",
  },
  {
    icon: LayoutDashboard,
    who: "You",
    title: "Start managing, publish when ready",
    body: "Add rooms and tenants, record payments with receipts, and publish rooms to students whenever you choose.",
    needs: ["Nothing more. You're set up"],
    manageOnly: {
      title: "Start managing",
      body: "Add rooms and tenants and record payments with receipts. Your property stays private; list it to students later if you choose.",
      needs: ["Nothing more. You're set up"],
    },
  },
];

const PATHS: { value: SignupPath; label: string }[] = [
  { value: "list", label: "Manage and list" },
  { value: "manage_only", label: "Manage only" },
];

/**
 * Vertical timeline tied to scroll position: the rail fills down to a line
 * 65% of the way down the viewport, and each step lights up once its marker
 * passes that line. Scrolling back up drains the rail and dims the steps again.
 */
export function LandlordSignupSteps() {
  const listRef = useRef<HTMLOListElement>(null);
  const [visible, setVisible] = useState(0);
  const [path, setPath] = useState<SignupPath>("list");

  useEffect(() => {
    const list = listRef.current;
    const rail = list?.querySelector<HTMLElement>(".ch-signup-steps__rail");
    const markers = Array.from(list?.querySelectorAll<HTMLElement>(".ch-signup-step__marker") ?? []);
    if (!list || !rail || markers.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      list.style.setProperty("--ch-signup-progress", "1");
      setVisible(markers.length);
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.65;
      const { top, height } = rail.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, (line - top) / height));
      // Written straight to the style so scrolling doesn't re-render the list.
      list.style.setProperty("--ch-signup-progress", progress.toFixed(4));
      setVisible(markers.filter((marker) => {
        const box = marker.getBoundingClientRect();
        return box.top + box.height / 2 <= line;
      }).length);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div className="ch-signup-flow">
      <div className="ch-signup-paths" role="group" aria-label="Show the steps for">
        {PATHS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={path === option.value}
            className="ch-signup-paths__option"
            onClick={() => setPath(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <ol ref={listRef} className="ch-signup-steps">
        <span className="ch-signup-steps__rail" aria-hidden="true">
          <span className="ch-signup-steps__fill" />
        </span>
        {SIGNUP_STEPS.map((step, index) => {
          const { icon: Icon, who, manageOnly } = step;
          const skipped = path === "manage_only" && manageOnly === "skipped";
          const { title, body, needs } =
            path === "manage_only" && manageOnly && manageOnly !== "skipped" ? manageOnly : step;
          return (
            <li
              key={step.title}
              data-step={index}
              data-visible={index < visible ? "true" : undefined}
              data-skipped={skipped ? "true" : undefined}
              className="ch-signup-step"
            >
              <span className="ch-signup-step__marker" aria-hidden="true">
                <Icon />
              </span>
              <div className="ch-signup-step__card">
                <p className="ch-signup-step__meta">
                  <span>Step {index + 1}</span>
                  <span className={who === "You" ? "ch-signup-step__who" : "ch-signup-step__who ch-signup-step__who--team"}>{who}</span>
                  {skipped && <span className="ch-signup-step__who ch-signup-step__who--skipped">Not needed for manage only</span>}
                </p>
                <h3>{title}</h3>
                <p>{body}</p>
                <ul className="ch-signup-step__needs" aria-label={`What you need for step ${index + 1}`}>
                  {needs.map((need) => <li key={need}>{need}</li>)}
                </ul>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
