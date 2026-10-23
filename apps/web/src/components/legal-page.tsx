import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpRight, FileText, ShieldCheck } from "lucide-react";

import type { LegalDocument } from "@/content/legal-documents";
import "./legal-page.css";

function InlineText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(start, match.index));
    parts.push(<a key={match.index} href={match[2]}>{match[1]}</a>);
    start = match.index + match[0].length;
  }
  parts.push(text.slice(start));
  return <>{parts}</>;
}

export function LegalPage({ document }: { document: LegalDocument }) {
  const isPrivacy = document.kind === "privacy";
  const Icon = isPrivacy ? ShieldCheck : FileText;
  return (
    <article className="ch-legal" aria-labelledby="legal-title">
      <header className="ch-legal__header">
        <p className="ch-eyebrow">CampusHomes legal</p>
        <h1 id="legal-title">{document.title}</h1>
        <p className="ch-legal__intro">
          {isPrivacy
            ? "How CampusHomes uses personal information, the choices available to you, and your rights under Ugandan law."
            : "Understand the CampusHomes service, free reservations, landlord responsibilities and the terms that apply to using the platform."}
        </p>
        <p className="ch-legal__metadata">Prepared {document.prepared} <span aria-hidden="true">·</span> {document.version} <span aria-hidden="true">·</span> Issued by Akolet</p>
        <div className="ch-legal__review" role="note" aria-label="Draft status">
          <Icon aria-hidden="true" size={22} />
          <div>
            <strong>Review draft for staging testing</strong>
            <p>This draft is not effective legal terms. Company details and operational commitments still need verification and approval. No effective date has been assigned.</p>
          </div>
        </div>
        <div className="ch-legal__actions">
          <a className="ch-legal__download" href={document.downloadHref} download>
            <ArrowDownToLine aria-hidden="true" size={18} /> Download Word draft
          </a>
          <Link href={isPrivacy ? "/terms" : "/privacy"}>
            {isPrivacy ? "Read terms and conditions" : "Read the privacy policy"} <ArrowUpRight aria-hidden="true" size={17} />
          </Link>
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
