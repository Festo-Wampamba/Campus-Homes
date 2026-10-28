# Legal draft document verification

Checked 23 October 2026

## Deliverable checks

| Draft | Final rendered pages | Source text comparison | SHA256 of DOCX |
| --- | ---: | --- | --- |
| CampusHomes Privacy Policy | 7 | Complete body text matches its Markdown source after removing Markdown formatting and normalising whitespace | 744db954f958c4a637dd1f9ada7c289c92be5985b6544fe70787545aea3e8655 |
| CampusHomes Terms and Conditions | 7 | Complete body text matches its Markdown source after removing Markdown formatting and normalising whitespace | 6ee822ec93335581cf3b5d898122124b34503de812c3c82ae18941247659691c |

Both Word files were rendered using the bundled document renderer and all 14 final pages were visually inspected. The first render exposed an inherited blue title border; it was removed before the final render. Final copies use black titles and headings, native Word heading styles, readable 11.5 point body text, page numbers, version/date metadata, persistent draft identification and clickable research links. No clipped text, overlapping elements, isolated heading at a page bottom or source-link-only extra final page remained. Stale images from the earlier render were removed from the temporary QA directory after checking the final PDF page count.

The privacy statutory timelines and special-data and transfer language received an independent focused review and corrections were integrated. The review did not replace legal sign-off. Relative links in the research package were checked for missing local targets. Original source hashes are recorded in SOURCE-MANIFEST.md; the landlord agreement remained unchanged.

The PDFs and page images used for QA are temporary working files and are not additional publication outputs. No application behaviour or infrastructure was changed; application tests and production acceptance were not rerun for this documentation task. Outstanding operator, DPO, registration, provider-country, retention and commercial decisions remain explicit in the drafts and research report.
