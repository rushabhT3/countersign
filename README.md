# Countersign

**An accounts-payable review workbench where the agent proposes and the human countersigns.**

The agent opens an invoice, runs a three-way match, hunts for duplicates, checks the vendor's bank details, highlights the exact field on the scanned page, flags issues, proposes GL codes, and asks for a decision. Only the reviewer's click can approve. Every tool call and every click lands in one audit log.

![Countersign workbench](docs/hero.png)

- **Live:** _add the Vercel URL_
- **Video:** _add the YouTube link_
- Built for [The WebMCP Challenge](https://webmcp.devpost.com) (OpenAI × Devpost), September 2026.

## Try it in 60 seconds

**ChatGPT desktop.** Open the built-in browser (`Ctrl/Cmd+Shift+B`), turn on *Settings → Browser → Permissions → Enable site tools*, pick GPT-5.6 Sol, and load the live URL. The Site tools dropdown lists four queue tools; nine more appear once an invoice is open.

**Chrome 149+.** Enable `chrome://flags/#enable-webmcp-testing`, relaunch, install the Model Context Tool Inspector extension, and load the live URL. DevTools → Application → WebMCP shows the registered tools.

Paste one of these:

```
Work through my review queue. Ask me to countersign each one.
Work through invoice NP-88120.
Check invoice 2291 from Apex before I pay it.
```

No login, no server. State lives in `localStorage`; **Reset demo** in the header reloads the nine seed invoices.

## What the agent can do

| Tool | Access | What it does |
| --- | --- | --- |
| `list_invoices` | read | Queue rows with id, vendor, total, status, open-issue count; filters by status, vendor, minimum total. |
| `open_invoice` | read | Opens an invoice on the reviewer's screen; returns header fields, low-confidence fields, open issues, and the nine tools that just became available. |
| `get_review_summary` | read | Counts by status, pending value, invoices with high-severity issues, suggested next invoice. |
| `get_decision` | read | Current outcome of a countersign decision (pending, approved, held, rejected, dismissed). |
| `get_line_items` | read | Paginated line items with extraction confidence and accepted GL code. |
| `run_three_way_match` | read | Invoice vs purchase order vs goods receipt, line by line, plus subtotal, tax, and total arithmetic. Result also renders in the Match tab. |
| `find_duplicates` | read | Same vendor with the same total within 14 days, or the same invoice number after normalization (`INV-2291` ≡ `2291`). |
| `get_vendor_profile` | read | Terms, history, tolerance, tax rate, bank on file vs bank printed on this invoice, days since the bank changed. |
| `show_field_evidence` | read | Draws a pulsing highlight on the page image and returns value, confidence, page, and bbox. |
| `add_comment` | write | Posts under the Agent identity, optionally pinned to a field. The reviewer replies in the same thread. |
| `flag_issue` | write | Records a typed, severity-rated issue; moves the invoice to *flagged*. Open issues block approval. |
| `propose_gl_coding` | write | Saves pending GL proposals per line; the reviewer accepts or edits them on the card. Atomic; unknown codes get the valid list back. |
| `request_countersign` | write | Opens the countersign card and waits up to 25 s for the click. Times out to `pending`; repeat calls are idempotent. |

The first four are registered for the life of the page. The other nine register once when an invoice opens and are unregistered when the workbench returns to empty.

## How countersign works

1. The agent calls `request_countersign` with an action (approve, hold, reject), its rationale, and the issue ids it considered.
2. A bottom sheet slides in on the reviewer's screen. It lists every open issue with **Mark fixed** / **Waive**, and, for invoices without a clean PO match, a GL table with **Accept** per line.
3. **Approve** is enabled only when there are zero open issues and either the three-way match is clean or every line carries an accepted GL code. **Hold**, **Reject**, and **Dismiss** are always available.
4. The tool call resolves the moment the reviewer clicks, with the outcome and the suggested next invoice. If nobody clicks within 25 s it returns `pending`; the card stays open and the agent polls `get_decision`.

Nothing auto-approves. In code, `setStatus` is typed to exclude `approved`; the only path that writes it is `resolveDecision`, and the test suite scans the source to prove only [`CountersignCard`](components/CountersignCard.tsx) calls it.

## Why WebMCP and not a remote MCP server

A remote server can read the same data, but it cannot draw a highlight on the reviewer's screen, cannot open a card inside their signed-in session, and cannot make its own call wait for their click on the same page. WebMCP puts the agent and the reviewer on one document, one state, one audit log. The reviewer watches the agent work in the Audit tab, replies in the Comments tab, and clicks the card the agent opened.

## Architecture

- [`lib/webmcp/registry.ts`](lib/webmcp/registry.ts) — `defineTool` (throws in development when a name, description, or parameter description exceeds Chrome's budgets), `clamp` (every output ≤ 1,500 chars, always valid JSON, `"truncated":true` when cut), `registerTools` (the single `document.modelContext.registerTool(` call, with a `navigator.modelContext` fallback for Chrome 149), and the wrapper that validates input with zod, catches errors into `{"error": …}`, and writes an audit entry for every call.
- [`lib/webmcp/tools/queue.ts`](lib/webmcp/tools/queue.ts) — the four always-on tools. [`lib/webmcp/tools/invoice.ts`](lib/webmcp/tools/invoice.ts) — the nine gated tools and the two-phase countersign wait.
- [`components/WebMCPProvider.tsx`](components/WebMCPProvider.tsx) — registration lifecycle. Queue tools register on mount; invoice tools register when `openInvoiceId` becomes non-null and abort when it returns to null. The effect keys on the boolean, so switching invoices does not re-register.
- [`lib/webmcp/errors.ts`](lib/webmcp/errors.ts) — every error is a sentence that names the recovery step (`Call list_invoices to see valid ids.`).
- [`lib/store.ts`](lib/store.ts) — zustand store persisted to `localStorage` under `countersign-v1`. Invoices, issues, comments, GL proposals, decisions, and the audit log.
- [`lib/domain/`](lib/domain) — pure functions: `match.ts` (three-way match), `duplicates.ts`, `tax.ts`, `next.ts`, `approval.ts` (the Approve gate shared by the card and the tool).
- [`components/`](components) — the workbench: queue, page viewer with fraction-based bbox overlays, inspector tabs, manual-parity actions, countersign card.
- [`scripts/gen/`](scripts/gen) — the Python generator that renders the invoices and records bboxes at draw time.

Annotations: read tools carry `readOnlyHint`; tools that return document or vendor text carry `untrustedContentHint`. Zod 4 schemas are the single source of truth: `z.toJSONSchema` produces the advertised schema and `safeParse` validates the call.

## Data

| Invoice | Vendor | Scenario | What the agent should find |
| --- | --- | --- | --- |
| INV-10231 | Apex Industrial Supply | clean | Matches PO-44718 and the receipt exactly. |
| NP-88120 | Northwind Packaging | qty_mismatch | Line 1 bills 120; PO and receipt say 100. |
| LF-2026-0917 | Lumen Freight | price_variance | Line 1 at 312.40 vs PO 300.00, +4.13% against a 3% tolerance. |
| INV-2291 | Apex Industrial Supply | duplicate_original | Already approved on 2026-08-06. |
| 2291 | Apex Industrial Supply | duplicate | Same vendor, PO, total; number normalizes to INV-2291. |
| HOI-3391 | Harbor Office Interiors | vendor_bank_change | Bank ****8812 on the document vs ****5567 on file; changed 2026-07-28. Stamp over the due date drops its confidence to 0.74. |
| CCS-77213 | Cobalt Cloud Systems | non_po | No purchase order; needs GL 6210. |
| NP-88131 | Northwind Packaging | clean | Clean. |
| HOI-3402 | Harbor Office Interiors | tax_rounding | Tax printed 188.00; 8% of 2,349.75 is 187.98. Stamp over the tax drops its confidence to 0.71. |

Regenerate everything with:

```
pip install -r scripts/gen/requirements.txt
python scripts/gen/generate.py && python scripts/gen/debug_overlay.py
```

## Tests and evals

```
npm test        # vitest: domain fixtures, budgets, every tool × every invoice ≤ 1,500 chars, countersign idempotency, approval-path source scan
npm run lint
npm run build
```

[`evals/scenarios.json`](evals/scenarios.json) lists nine prompts with the tools each should trigger and the expected outcome. They run by hand in ChatGPT desktop and in Chrome with the Model Context Tool Inspector; results go in `evals/RESULTS.md`.

## What production would add

Server-side auth and per-reviewer identity, durable persistence instead of `localStorage`, ERP sync for POs, receipts, and vendor master data, real OCR in place of the generator's bboxes, and an approval policy engine (limits, segregation of duties) behind the same countersign card.

## Disclosure

Synthetic documents were generated with a generator adapted from prior personal work. All application and WebMCP code was written during the submission period (Aug 25–Sep 3, 2026); see commit history.

## License

MIT
