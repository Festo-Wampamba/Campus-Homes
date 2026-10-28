import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, FileText, ShieldCheck } from "lucide-react";

import type { LegalDocument } from "@/content/legal-documents";
import "./legal-page.css";

function InlineText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(start, match.index));
    parts.push(<a key={match.index} href={match[2]}>{match[1]}</a>);
    start = match.index + match[0].length;
  }
  parts.push(text.slice(start));
  return <>{parts}</>;
}

const INTROS: Record<LegalDocument["kind"], string> = {
  privacy: "How CampusHomes uses personal information, the choices available to you, and your rights under Ugandan law.",
  terms: "Understand the CampusHomes service, free reservations, landlord responsibilities and the terms that apply to using the platform.",
  "landlord-agreement": "The standard terms between Akolet and a landlord who lists student accommodation on CampusHomes.",
};

// The landlord agreement links out to these two but isn't linked back yet:
// it will sit in the landlord section instead (Festo, 28 October).
const OTHER_DOCUMENTS: { kind: LegalDocument["kind"]; href: string; label: string }[] = [
  { kind: "terms", href: "/terms", label: "Read terms and conditions" },
  { kind: "privacy", href: "/privacy", label: "Read the privacy policy" },
];

export function LegalPage({ document }: { document: LegalDocument }) {
  const Icon = document.kind === "privacy" ? ShieldCheck : FileText;
  return (
    <article className="ch-legal" aria-labelledby="legal-title">
      <header className="ch-legal__header">
        <p className="ch-eyebrow">CampusHomes legal</p>
        <h1 id="legal-title">{document.title}</h1>
        <p className="ch-legal__intro">{INTROS[document.kind]}</p>
        <p className="ch-legal__metadata">Prepared {document.prepared} <span aria-hidden="true">·</span> {document.version} <span aria-hidden="true">·</span> Issued by Akolet</p>
        <div className="ch-legal__review" role="note" aria-label="Draft status">
          <Icon aria-hidden="true" size={22} />
          <div>
            <strong>Draft, not final</strong>
            <p>
              This draft is not yet in force. Company details and operational commitments are still being verified and
              approved, and no effective date has been set.
              {document.kind === "landlord-agreement" && " It cannot be signed or accepted through this page."}
            </p>
          </div>
        </div>
        <div className="ch-legal__actions">
          {OTHER_DOCUMENTS.filter((other) => other.kind !== document.kind).map((other) => (
            <Link key={other.kind} href={other.href}>
              {other.label} <ArrowUpRight aria-hidden="true" size={17} />
            </Link>
          ))}
        </div>
      </header>

      <div className="ch-legal__layout">
        <aside className="ch-legal__aside">
          <nav aria-label="On this page" className="ch-legal__contents">
            <h2>On this page</h2>
            <ol>
              {document.sections.map((section) => (
                <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>
              ))}
            </ol>
          </nav>
          <div className="ch-legal__help">
            <h2>Have a question?</h2>
            <p>Contact the CampusHomes team about this draft or a privacy request.</p>
            <a href="mailto:info@akolet.co.ug">info@akolet.co.ug</a>
            <Link href="/contact">Contact Us <ArrowUpRight aria-hidden="true" size={16} /></Link>
          </div>
        </aside>

        <div className="ch-legal__body">
          {document.sections.map((section) => (
            <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`}>
              <h2 id={`${section.id}-heading`}>{section.title}</h2>
              {section.blocks.map((block, index) => block.type === "list" ? (
                <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}><InlineText text={item} /></li>)}</ul>
              ) : <p key={index}><InlineText text={block.text} /></p>)}
            </section>
          ))}
          <footer className="ch-legal__end">
            <p>CampusHomes · Developed and operated by Akolet</p>
            <a href="#legal-title">Back to top ↑</a>
          </footer>
        </div>
      </div>
    </article>
  );
}
