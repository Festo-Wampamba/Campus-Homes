// Runtime check, same reason as ALLOW_INDEXING: one image is promoted from
// staging to production. Fail-safe: the legal review drafts (which carry
// unverified company details and pre-publication notes) show only where an
// environment opts in; everywhere else the in-force policy is served.
export function isLegalDraftPreview(): boolean {
  return process.env.LEGAL_DRAFT_PREVIEW === "true";
}
