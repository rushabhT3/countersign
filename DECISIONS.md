# Decisions

One line per choice the spec left open. Newest at the bottom.

## Code

- `lib/types.ts` holds the shared seed and domain interfaces; `lib/store.ts` exports the runtime types (Issue, Comment, Decision, AuditEntry, InvoiceState).
- The countersign resolver map lives in `lib/webmcp/decisions.ts` instead of `tools/invoice.ts`, so the store can import it without a store ↔ tools import cycle.
- `resolveDecision` sets the invoice status itself (approved / held / rejected; dismissed leaves it). `CountersignCard` calls only `resolveDecision`; `setStatus` is typed `Exclude<Status, 'approved'>` so no other path can compile an approval.
- `escapeText` strips control and bidi-override characters and caps length; React already entity-escapes text, so HTML encoding would double-escape.
- `price_variance_pct` is signed and rounded to 2 dp; the tolerance check compares the absolute value.
- `setGlProposals` merges by line: lines in the new proposal are replaced with `accepted:false`; untouched lines keep their state.
- `InvoiceState.duplicate_check` stores the latest `find_duplicates` result (agent or manual) so the Match tab shows it.
- Ids come from one persisted counter (`iss_1`, `cmt_2`, `dec_3`, `aud_4`) so agent output and the audit log stay readable.
- The audit log keeps the newest 500 entries.
- Persist uses `skipHydration`; `Workbench` calls `rehydrate()` in an effect and renders a loading shell until `hydrated`, which avoids a server/client mismatch. A memory storage stands in when `localStorage` is missing (tests, server render).
- `inv_004a` carries `approved_on`; a reset seeds one system audit entry (`imported_as_approved`) for it.
- `clamp` shrinks arrays for up to 5000 steps (spec said 200) so a large array shrinks instead of falling through to text truncation.
- Manual parity: `lib/ui/manual.ts` holds every human action (domain call + store + audit); `components/ManualActions.tsx` renders the buttons and inline forms. Human audit names mirror the tool names, plus `close_invoice`, `resolve_issue`, `accept_gl_code`, `countersign_<outcome>`, `export_audit`, and the system `reset_demo`.
- A `no_po` match result still lists lines, each with verdict `line_not_on_po`, for information; the message states there is no PO.
- A missing goods receipt yields `qty_received: null` and the verdict falls through to the ordered-quantity and price checks; no extra mismatch string.
- `get_vendor_profile` also returns `name_on_document` (document text, hence the untrusted hint) next to the vendor-master name.
- `PageViewer` uses a plain `<img>` per the spec, with a one-line eslint disable for `@next/next/no-img-element`.
- Design: light only; tokens in `app/globals.css` under `@theme`; Tailwind palette for chips; Geist / Geist Mono from the scaffold. Grid collapses to a single column under 1100 px.
- Registered-tool count for the header pill is tracked in the store (`registeredTools`, not persisted) by `WebMCPProvider`.
- `lib/webmcp/examples.ts` builds a ready-to-paste input per tool from the open invoice (issue fields, match findings, duplicate candidates, bank mismatch, pending decision ids) for people driving the tools by hand in Chrome's inspector. The agent never receives these; they are UI only.
- `open_invoice` and `get_decision` return `reviewer_replies` (newest three human comments, 100 chars each) so a reply typed in the Comments tab reaches the agent without a fourteenth tool.
- `STORE_VERSION` is 2: the tenth invoice would otherwise be missing for anyone whose browser still holds the version-1 state, and the persist migration resets to seed on a version change.
- `scripts/gen/out/` (PDFs, logo/stamp rasters, debug overlays) is gitignored; regenerate with `python scripts/gen/generate.py && python scripts/gen/debug_overlay.py`.

## Data (S1 generator)

- Vendor names: Lumen Freight Inc., Cobalt Cloud Systems, Harbor Office Interiors (Apex and Northwind were given).
- Vendor extras: northwind 22 invoices / $3,900 avg / billing@northwindpackaging.com; lumen 9 / $2,100 / invoices@lumenfreight.com; cobalt 12 / $1,450 / billing@cobaltcloud.io; harbor 6 / $5,200 / accounts@harborofficeinteriors.com.
- Printed amounts carry `$` and thousands separators; JSON field `value` is the normalized string (`4120.00`). Dates print in ISO form.
- Bill-to on every document: Meridian Manufacturing Inc., 1200 Industrial Parkway, Columbus, OH 43215.
- Doc-only vendor details (address, phone, bank name, routing, logo) live in `templates.VENDOR_DOC` and are not exported to `data/`.
- PO issued and receipt dates fall 2–10 days before each invoice; receipt ids GR-9003…GR-9021; SKUs invented per vendor. PO-44725 line 2 is a kraft void-fill roll at 110.00.
- Unit is `ea` everywhere except inv_006 line 1 (`seat`).
- inv_005 carries a red remit note ("remittances go to our new account effective Aug 1, 2026") as the social-engineering cue.
- Stamp dates: inv_001 2026-08-13, inv_005 2026-08-19, inv_008 2026-08-25; 200 pt wide, alpha 0.55, 12°.
- Template A (Helvetica): apex, cobalt, harbor. Template B (Times): northwind, lumen.
- PIL rasters use `C:/Windows/Fonts/arial(bd).ttf` when present, so logo and stamp pixels are deterministic on Windows and may differ elsewhere.
- Tenth document, beyond the spec's nine: inv_009 (LF-2026-0942, Lumen, PO-44745, receipt GR-9024) bills two PO lines plus a $95 "Fuel surcharge" line whose description is an instruction aimed at the agent. The three-way match reports line 3 as not on the PO; the scenario exists to show the untrusted-content hints and the human-only approval path under an injection attempt.
