# CLAUDE.md — Countersign (WebMCP Challenge entry)

This file is the complete, standalone build document. Place it at the repo root as `CLAUDE.md`. Claude Code reads it automatically. Nothing else is required to start building. Sections 1–2 are context, 3–16 are the spec, 17 is the session plan, 18 is the human-only checklist, 19–20 are submission text.

If anything is unspecified, choose the simplest option and record it in `DECISIONS.md`. If two sections conflict, the tool contracts in §10 win.

---

## 1. Competition facts

- **Event:** The WebMCP Challenge — OpenAI × Devpost. https://webmcp.devpost.com · rules https://webmcp.devpost.com/rules
- **Deadline:** September 3, 2026, 1:00 PM PDT = September 4, 2026, 1:30 AM IST. Internal deadline: submit by **September 4, 00:00 IST**.
- **Prize:** flat top-10. Each winner: $3,000 cash (OpenAI) + $500 cash (Netlify) + Codex Micro + ChatGPT Pro 1 yr + Cloudflare/Vercel/Render credits + Shopify gear + Google AI Ultra 3 months.
- **Entrant:** solo individual, India (eligible — India is on OpenAI's supported-countries list and not in the exclusion list).

**Must submit:**
1. Live URL that works in ChatGPT desktop's built-in browser or Chrome 149+ with `chrome://flags/#enable-webmcp-testing`
2. Public GitHub repo, MIT license visible in the About section, containing the literal `document.modelContext.registerTool(`
3. Text description answering four questions (see §19)
4. Public YouTube video under 3 minutes with voiceover, no copyrighted music
5. After submitting: freeze repo, site, and Devpost until winners are announced (~Sep 23)

**Judging:** Stage 1 pass/fail (fits theme, uses WebMCP). Stage 2 four equal criteria — **WebMCP Leverage, Execution, Potential Impact, Creativity & Ambition**. Ties break on WebMCP Leverage first. Judges are not required to test; description + repo + video carry the score.

**Platform constraints (verified against Chrome and OpenAI docs, Aug 2026):**
- ChatGPT browser supports only the imperative JS API. No declarative form attributes. No tools inside iframes. Register in the top-level page. Use GPT-5.6 Sol or Terra.
- Every invocation gets a safety review in the ChatGPT browser; consequential actions prompt confirmation. That is expected and fine.
- Chrome budgets: tool name ≤ 30 chars, description ≤ 500, each param description ≤ 150, each output ≤ 1,500 chars.
- Never send `Origin-Agent-Cluster: ?0` (WebMCP needs origin isolation). Vercel defaults are fine.
- Chrome 153+: unregistering a tool does not cancel an in-flight execution.

**What already exists in the showcase (do not imitate):** 3D modeling, note-taking, crossword, beat machine, trip planner, photo editor, meal planner, Rubik's cube, greeting cards, grocery cart, coffee shop, storefront, pizza maker, flight search, bistro, DuckDB data explorer. All consumer or commerce. None has financial stakes, mandatory human sign-off, or an audit trail.

---

## 2. The idea — Countersign

**One line:** an accounts-payable review workbench where the agent proposes and the human countersigns.

**What happens:** a reviewer opens the queue. ChatGPT, running in the same page, calls page tools to open an invoice, run a three-way match against PO and goods receipt, search for duplicates, check the vendor's bank details, highlight the exact field on the invoice image so the reviewer can see it, flag issues, propose GL codes, and finally request a countersign. A card slides in. Only the reviewer's click can approve. Every tool call and every human click lands in an audit log.

**Why judges score it:**
- *WebMCP Leverage:* 13 tools, state-scoped registration (invoice tools exist only while an invoice is open), annotation hints, Chrome's character budgets enforced in code, actionable recovery errors, idempotent two-phase countersign, audit trail of every call.
- *Execution:* complete loop queue → open → verify → decide → next. Seeded data, reset button, no login, deterministic.
- *Potential Impact:* AP teams review thousands of invoices a month; an agent approving a duplicate is a segregation-of-duties failure. Countersign is the control.
- *Creativity:* the agent reads numbers perfectly but cannot visually verify a scanned document; the human verifies visually but hates matching 40 lines. Evidence-pinning plus countersign is a pattern no showcase app has.

**Not building:** auth, server, database, ERP integration, chat UI, LLM calls. README describes them under "What production would add."

---

## 3. Hard rules for every Claude Code session

1. **Client-only.** No API routes, no database, no env secrets. State lives in a zustand store persisted to `localStorage` (key `countersign-v1`). Seed data is static JSON in `data/` and PNGs in `public/invoices/`.
2. **No pdf.js / react-pdf.** Pages are pre-rendered PNGs from `scripts/gen/generate.py`. The viewer is `<img>` plus absolutely positioned overlay divs.
3. **Imperative WebMCP API only**, registered from a `"use client"` component in the top-level page. The literal `document.modelContext.registerTool(` must remain in `lib/webmcp/registry.ts`.
4. **Every tool goes through `lib/webmcp/registry.ts`.** No `registerTool` calls anywhere else.
5. **Exactly 13 tools**, names as in §10. Adding, renaming, or removing a tool requires updating `evals/scenarios.json`, `tests/tools.test.ts`, and `README.md` in the same commit.
6. **Budgets enforced in code:** `defineTool` throws in development if name > 30, description > 500, or any param description > 150. The wrapper clamps serialized output to 1,500 chars and appends `"truncated":true`.
7. **Tools return compact JSON strings.** `execute` returns a plain object; the wrapper stringifies without whitespace. Errors are `{"error":"<sentence from §11>"}` — never thrown to the agent.
8. **Only a human click sets `approved`.** No code path outside `CountersignCard` button handlers may set status `approved`. `propose_gl_coding` writes proposals; acceptance happens in the card.
9. **Descriptions use positive language.** No "don't", "never", "do not use for".
10. **Bboxes are fractions `[x0,y0,x1,y1]` in [0,1]**, origin top-left. Never pixels.
11. **Lifecycle:** queue tools register on mount. Invoice tools register once when `openInvoiceId` becomes non-null and abort only when it returns to null. Effects depend on the boolean `isOpen`, not the id, so switching invoices does not re-register.
12. **Escape document and vendor text before rendering.** Tools that return it carry `untrustedContentHint: true`.
13. **No Playwright/E2E, no UI kits, no upgrades.** Vitest unit tests only. Tailwind utilities only. Versions pinned in §4.
14. **Every session ends with:** `npm run build` clean, `npm test` green, `npm run lint` clean, a paragraph appended to `PROGRESS.md`, one commit.
15. **Do not touch:** `LICENSE`, anything under `submission/`, video assets.

---

## 4. Stack (pinned — verified on npm, September 2, 2026)

| Package | Version | Notes |
|---|---|---|
| next | 16.3.4 | App Router, `create-next-app@16.3.4`, keep the TypeScript version it scaffolds |
| react / react-dom | 19.2.8 | |
| tailwindcss | 4.3.3 | |
| zustand | 5.0.15 | `persist` middleware |
| zod | 4.5.4 | `z.object`, `z.looseObject`, `z.toJSONSchema()`. `.passthrough()` is deprecated — do not use |
| webmcp-types | 0.1.5 | devDependency; extend gaps in `lib/webmcp/types.d.ts` |
| vitest | 4.1.11 | devDependency |
| Python 3.11+ | — | `reportlab`, `PyMuPDF`, `Pillow` pinned in `scripts/gen/requirements.txt` |

Hosting: Vercel (human deploys). License: MIT.

---

## 5. Repository layout

```
countersign/
├── CLAUDE.md                      # this file
├── DECISIONS.md                   # unspecified choices, one line each
├── PROGRESS.md                    # per-session summaries
├── LICENSE                        # MIT (human creates)
├── README.md                      # §16
├── package.json
├── app/
│   ├── layout.tsx
│   ├── page.tsx                   # renders <Workbench/>
│   └── globals.css
├── components/
│   ├── Workbench.tsx              # 3-column grid + header
│   ├── Header.tsx                 # title, counts, WebMCP status pill, Reset
│   ├── WebMCPBanner.tsx           # shown when document.modelContext is missing
│   ├── WebMCPProvider.tsx         # registration lifecycle (§9)
│   ├── Queue.tsx
│   ├── PageViewer.tsx             # <img> + overlays + highlight
│   ├── InspectorTabs.tsx
│   ├── tabs/FieldsTab.tsx
│   ├── tabs/LineItemsTab.tsx
│   ├── tabs/MatchTab.tsx
│   ├── tabs/CommentsTab.tsx
│   ├── tabs/AuditTab.tsx
│   └── CountersignCard.tsx
├── lib/
│   ├── store.ts                   # zustand store + actions (§8)
│   ├── seed.ts                    # loads data/*.json into initial state
│   ├── domain/
│   │   ├── normalize.ts
│   │   ├── match.ts
│   │   ├── duplicates.ts
│   │   ├── tax.ts
│   │   └── next.ts                # nextInvoiceId()
│   └── webmcp/
│       ├── types.d.ts
│       ├── registry.ts            # defineTool, registerTools, clamp, audit hook
│       ├── errors.ts              # §11 strings
│       ├── tools/queue.ts         # 4 always-on tools
│       └── tools/invoice.ts       # 9 gated tools
├── data/
│   ├── vendors.json
│   ├── pos.json
│   ├── receipts.json
│   ├── gl_codes.json
│   └── invoices/inv_001.json … inv_008.json  (inv_004a.json, inv_004b.json)
├── public/invoices/<id>/page-1.png
├── scripts/gen/
│   ├── requirements.txt
│   ├── generate.py                # PDF → PNG + JSON (§13)
│   ├── debug_overlay.py           # draws bboxes on PNGs for visual check
│   └── templates.py
├── tests/
│   ├── match.test.ts
│   ├── duplicates.test.ts
│   ├── tax.test.ts
│   └── tools.test.ts
├── evals/scenarios.json
└── submission/                    # human-owned: devpost.md, video-script.md
```

---

## 6. Data model

All money values are numbers with two decimals, currency USD. Dates are `YYYY-MM-DD`. Ids are stable strings.

### 6.1 `data/vendors.json`
```json
[
  {
    "id": "ven_apex",
    "name": "Apex Industrial Supply LLC",
    "payment_terms": "Net 30",
    "tax_rate": 0.08,
    "price_tolerance_pct": 2.0,
    "bank_account_last4": "4471",
    "bank_last_changed": "2025-11-02",
    "invoices_last_12m": 14,
    "avg_invoice_amount": 8400.00,
    "contact_email": "ar@apexindustrial.com"
  }
]
```

### 6.2 `data/pos.json`
```json
[
  {
    "po_number": "PO-44718",
    "vendor_id": "ven_apex",
    "issued": "2026-07-30",
    "lines": [
      { "line": 1, "sku": "APX-BRK-200", "description": "Steel mounting bracket, 200mm", "qty": 60, "unit_price": 100.00 }
    ]
  }
]
```

### 6.3 `data/receipts.json`
```json
[
  {
    "receipt_id": "GR-9012",
    "po_number": "PO-44718",
    "received_date": "2026-08-10",
    "lines": [ { "line": 1, "qty_received": 60 } ]
  }
]
```

### 6.4 `data/gl_codes.json`
```json
[
  { "code": "5010", "name": "COGS — materials" },
  { "code": "5020", "name": "Packaging" },
  { "code": "5030", "name": "Freight-in" },
  { "code": "6110", "name": "Office supplies" },
  { "code": "6120", "name": "Furniture & fixtures" },
  { "code": "6210", "name": "Software subscriptions" },
  { "code": "6220", "name": "Cloud hosting" },
  { "code": "6310", "name": "Professional services" },
  { "code": "6410", "name": "Travel" },
  { "code": "6510", "name": "Utilities" },
  { "code": "6610", "name": "Marketing" },
  { "code": "6710", "name": "Repairs & maintenance" },
  { "code": "1510", "name": "Fixed assets" },
  { "code": "2010", "name": "Accrued liabilities" },
  { "code": "6900", "name": "Miscellaneous" }
]
```

### 6.5 `data/invoices/<id>.json` (produced by the generator)
```json
{
  "id": "inv_002",
  "invoice_number": "NP-88120",
  "vendor_id": "ven_northwind",
  "vendor_name_on_doc": "Northwind Packaging Co.",
  "issue_date": "2026-08-14",
  "due_date": "2026-09-28",
  "currency": "USD",
  "po_number": "PO-44720",
  "subtotal": 4120.00,
  "tax": 329.60,
  "total": 4449.60,
  "bank_account_last4_on_doc": "9083",
  "initial_status": "needs_review",
  "scenario": "qty_mismatch",
  "pages": [ { "page": 1, "image": "/invoices/inv_002/page-1.png", "width_px": 1275, "height_px": 1650 } ],
  "fields": {
    "invoice_number": { "value": "NP-88120", "confidence": 0.97, "page": 1, "bbox": [0.62, 0.11, 0.78, 0.125] },
    "issue_date":     { "value": "2026-08-14", "confidence": 0.96, "page": 1, "bbox": [0.62, 0.13, 0.78, 0.145] },
    "due_date":       { "value": "2026-09-28", "confidence": 0.95, "page": 1, "bbox": [0.62, 0.15, 0.78, 0.165] },
    "po_number":      { "value": "PO-44720",  "confidence": 0.98, "page": 1, "bbox": [0.62, 0.17, 0.78, 0.185] },
    "vendor_name":    { "value": "Northwind Packaging Co.", "confidence": 0.99, "page": 1, "bbox": [0.08, 0.08, 0.40, 0.10] },
    "subtotal":       { "value": "4120.00", "confidence": 0.97, "page": 1, "bbox": [0.72, 0.62, 0.90, 0.635] },
    "tax":            { "value": "329.60",  "confidence": 0.96, "page": 1, "bbox": [0.72, 0.64, 0.90, 0.655] },
    "total":          { "value": "4449.60", "confidence": 0.98, "page": 1, "bbox": [0.72, 0.66, 0.90, 0.68] },
    "bank_account":   { "value": "****9083", "confidence": 0.94, "page": 1, "bbox": [0.08, 0.86, 0.35, 0.875] }
  },
  "line_items": [
    {
      "line": 1, "description": "Corrugated shipper 18x12x10", "qty": 120, "unit": "ea", "unit_price": 18.50, "amount": 2220.00, "confidence": 0.97,
      "page": 1,
      "bbox": { "description": [0.08,0.40,0.45,0.415], "qty": [0.50,0.40,0.56,0.415], "unit_price": [0.60,0.40,0.70,0.415], "amount": [0.76,0.40,0.90,0.415] }
    }
  ]
}
```

`bbox` is always `[x_min, y_min, x_max, y_max]` as fractions of page width/height in [0,1], origin top-left (never `[x,y,w,h]`, never pixels). The overlay math in §13 assumes this.

Header field keys are fixed: `invoice_number, issue_date, due_date, po_number, vendor_name, subtotal, tax, total, bank_account`. `po_number` is omitted from `fields` when the invoice has no PO. Line field keys: `line:<n>:description | qty | unit_price | amount`.

---

## 7. Seed scenarios (9 documents, exact values)

Vendors: `ven_apex` (Net 30, 8% tax, 2% tol, bank 4471 changed 2025-11-02), `ven_northwind` (Net 45, 8%, 2%, bank 9083, 2024-03-15), `ven_lumen` (Net 15, 0% tax, 3% tol, bank 2210, 2023-08-01), `ven_cobalt` (Net 30, 0%, 0% tol, bank 7734, 2024-01-10), `ven_harbor` (Net 30, 8%, 2%, bank 5567, changed **2026-07-28**).

| id | scenario | vendor | number | date | PO | lines (qty @ price) | subtotal / tax / total | planted fact |
|---|---|---|---|---|---|---|---|---|
| inv_001 | clean | apex | INV-10231 | 2026-08-12 | PO-44718 | 60 @ 100.00; 40 @ 75.00; 30 @ 100.00 | 12000.00 / 960.00 / 12960.00 | PO and receipt match exactly. RECEIVED stamp in blank area |
| inv_002 | qty_mismatch | northwind | NP-88120 | 2026-08-14 | PO-44720 | **120** @ 18.50; 40 @ 22.00; 10 @ 102.00 | 4120.00 / 329.60 / 4449.60 | PO line 1 qty 100, receipt 100. Invoice bills 120 |
| inv_003 | price_variance | lumen | LF-2026-0917 | 2026-08-15 | PO-44702 | 5 @ **312.40**; 2 @ 150.00 | 1862.00 / 0.00 / 1862.00 | PO price 300.00 → +4.13%, tolerance 3% |
| inv_004a | duplicate_original | apex | INV-2291 | 2026-08-03 | PO-44690 | 50 @ 100.00; 25 @ 100.00 | 7500.00 / 600.00 / 8100.00 | `initial_status: approved`, approved 2026-08-06 |
| inv_004b | duplicate | apex | 2291 | 2026-08-06 | PO-44690 | identical to inv_004a | 7500.00 / 600.00 / 8100.00 | same vendor, total, PO; number normalizes equal |
| inv_005 | vendor_bank_change | harbor | HOI-3391 | 2026-08-18 | PO-44731 | 8 @ 450.00; 4 @ 700.00 | 6400.00 / 512.00 / 6912.00 | bank on doc **8812** vs file 5567; stamp overlaps due_date → confidence 0.74 |
| inv_006 | non_po | cobalt | CCS-77213 | 2026-08-20 | — | 25 @ 48.00 "Team plan, 25 seats, Aug 2026"; 1 @ 250.00 "Storage add-on 2 TB" | 1450.00 / 0.00 / 1450.00 | no PO; needs GL 6210 |
| inv_007 | clean | northwind | NP-88131 | 2026-08-21 | PO-44725 | 100 @ 22.00; 10 @ 110.00 | 3300.00 / 264.00 / 3564.00 | clean |
| inv_008 | tax_rounding | harbor | HOI-3402 | 2026-08-24 | PO-44740 | 15 @ 156.65 | 2349.75 / **188.00** / 2537.75 | expected tax 187.98, expected total 2537.73; stamp overlaps tax → confidence 0.71 |

POs and receipts exist for every PO number above; receipt quantities equal PO quantities except where noted. Every invoice except inv_004a starts as `needs_review`. Field confidences default to a deterministic value in [0.93, 0.99] seeded from `hash(id + field)`; stamp-overlapped fields are set explicitly as in the table.

---

## 8. Runtime state (`lib/store.ts`)

```ts
type Status = 'needs_review' | 'flagged' | 'held' | 'approved' | 'rejected';
type Severity = 'low' | 'medium' | 'high';
type IssueType = 'qty_mismatch' | 'price_variance' | 'duplicate' | 'vendor_risk' | 'tax_error' | 'missing_po';

interface Issue { id: string; type: IssueType; severity: Severity; message: string; field?: string; line?: number;
  created_by: 'agent' | 'human'; created_at: number; resolved: boolean; resolution?: 'fixed' | 'waived'; waive_reason?: string; }
interface Comment { id: string; actor: 'agent' | 'human'; text: string; field?: string; created_at: number; }
interface GlProposal { line: number; gl_code: string; note?: string; accepted: boolean; }
interface Decision { id: string; invoice_id: string; requested_action: 'approve' | 'hold' | 'reject'; rationale: string;
  issue_ids: string[]; outcome: 'pending' | 'approved' | 'held' | 'rejected' | 'dismissed'; requested_at: number;
  resolved_at?: number; resolved_by?: 'human'; }
interface AuditEntry { id: string; ts: number; actor: 'agent' | 'human' | 'system'; kind: 'tool_call' | 'ui_action';
  name: string; invoice_id?: string; args_summary: string; result_summary: string; ok: boolean; duration_ms?: number; }

interface InvoiceState extends InvoiceSeed { status: Status; issues: Issue[]; comments: Comment[];
  gl_proposals: GlProposal[]; match_result?: MatchResult; }

interface Store {
  version: 1;
  invoices: Record<string, InvoiceState>;
  order: string[];                       // queue order = seed order
  openInvoiceId: string | null;
  highlight: { invoice_id: string; field: string; page: number; bbox: number[]; nonce: number } | null;
  decisions: Record<string, Decision>;
  audit: AuditEntry[];
  webmcpAvailable: boolean | null;       // null until checked
  // actions
  openInvoice(id: string): void; closeInvoice(): void;
  setHighlight(h: Store['highlight']): void;
  addIssue(invoiceId, issue): Issue; resolveIssue(invoiceId, issueId, resolution, reason?): void;
  addComment(invoiceId, comment): Comment;
  setGlProposals(invoiceId, proposals: GlProposal[]): void; acceptGl(invoiceId, line, code): void;
  setMatchResult(invoiceId, r): void;
  createDecision(d): Decision; resolveDecision(decisionId, outcome): void;   // ONLY CountersignCard calls with 'approved'
  setStatus(invoiceId, status): void;
  logAudit(e: Omit<AuditEntry,'id'|'ts'>): void;
  reset(): void;                          // reload seed, clear localStorage
}
```

Persist with `persist(..., { name: 'countersign-v1', version: 1 })`; on version mismatch, reset. `useStore.getState()` is used from tools (outside React). `openInvoice` also clears `highlight`.

---

## 9. WebMCP registry (`lib/webmcp/registry.ts`)

```ts
import { z } from 'zod';
import { useStore } from '@/lib/store';

export interface ToolDef<S extends z.ZodTypeAny> {
  name: string; description: string; input: S;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: z.infer<S>, ctx: { signal: AbortSignal }) => Promise<Record<string, unknown>>;
}

const LIMITS = { name: 30, description: 500, param: 150, output: 1500 };

export function defineTool<S extends z.ZodTypeAny>(def: ToolDef<S>): ToolDef<S> {
  if (process.env.NODE_ENV !== 'production') {
    if (def.name.length > LIMITS.name) throw new Error(`tool name too long: ${def.name}`);
    if (def.description.length > LIMITS.description) throw new Error(`description too long: ${def.name}`);
    const props = (z.toJSONSchema(def.input) as any).properties ?? {};
    for (const [k, v] of Object.entries<any>(props))
      if ((v.description ?? '').length > LIMITS.param) throw new Error(`param description too long: ${def.name}.${k}`);
  }
  return def;
}

// Always returns valid JSON. Strategy: (1) if it fits, return as-is; (2) shrink the longest array
// one element at a time and mark truncated; (3) as a last resort wrap a text cut in a valid object.
export function clamp(obj: unknown): string {
  let s = JSON.stringify(obj);
  if (s.length <= LIMITS.output) return s;
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const o: Record<string, unknown> = { ...(obj as Record<string, unknown>), truncated: true };
    for (let guard = 0; guard < 200; guard++) {
      const arrays = Object.entries(o).filter(([, v]) => Array.isArray(v) && (v as unknown[]).length > 1) as [string, unknown[]][];
      if (arrays.length === 0) break;
      const [k, v] = arrays.sort((a, b) => b[1].length - a[1].length)[0];
      o[k] = v.slice(0, -1);
      s = JSON.stringify(o);
      if (s.length <= LIMITS.output) return s;
    }
  }
  // Last resort: keep the longest prefix whose escaped form fits (binary search — escaping can double length).
  const raw = JSON.stringify(obj);
  const wrap = (n: number) => JSON.stringify({ truncated: true, text: raw.slice(0, n) });
  let lo = 0, hi = Math.min(raw.length, LIMITS.output);
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (wrap(mid).length <= LIMITS.output) lo = mid; else hi = mid - 1; }
  return wrap(lo);
}

// The spec moved modelContext from Navigator to Document (May 2026); Chrome 150 deprecates the
// navigator alias. Chrome 149 is the contest minimum, so both surfaces are checked.
export function getModelContext(): any | null {
  if (typeof document === 'undefined') return null;
  const d = (document as any).modelContext;
  if (typeof d?.registerTool === 'function') return d;
  const n = (navigator as any).modelContext;
  if (typeof n?.registerTool === 'function') return n;
  return null;
}

export function isWebMCPAvailable(): boolean { return getModelContext() !== null; }

export async function registerTools(defs: ToolDef<any>[], signal: AbortSignal): Promise<void> {
  // Keep the literal `document.modelContext.registerTool(` on this path — the contest scans for it.
  const useDocument = typeof (document as any).modelContext?.registerTool === 'function';
  const fallback = useDocument ? null : getModelContext();
  if (!useDocument && !fallback) return;
  for (const def of defs) {
    const definition = buildDefinition(def);
    if (useDocument) await document.modelContext.registerTool(definition, { signal });
    else await fallback.registerTool(definition, { signal });
  }
}

function buildDefinition(def: ToolDef<any>) {
  return ({
      name: def.name,
      description: def.description,
      inputSchema: z.toJSONSchema(def.input),
      annotations: def.annotations,
      execute: async (raw: unknown, ctx?: { signal?: AbortSignal }) => {
        const t0 = performance.now();
        const store = useStore.getState();
        const invoiceId = store.openInvoiceId ?? undefined;
        const parsed = def.input.safeParse(raw ?? {});
        if (!parsed.success) {
          const msg = `Invalid input: ${parsed.error.issues.map(i => `${i.path.join('.') || 'input'} ${i.message}`).join('; ')}.`;
          store.logAudit({ actor: 'agent', kind: 'tool_call', name: def.name, invoice_id: invoiceId, args_summary: summarize(raw), result_summary: msg, ok: false });
          return clamp({ error: msg });
        }
        try {
          const result = await def.execute(parsed.data, { signal: ctx?.signal ?? new AbortController().signal });
          const out = clamp(result);
          store.logAudit({ actor: 'agent', kind: 'tool_call', name: def.name, invoice_id: invoiceId, args_summary: summarize(parsed.data), result_summary: summarize(result), ok: !('error' in result), duration_ms: Math.round(performance.now() - t0) });
          return out;
        } catch (e) {
          const msg = e instanceof Error && e.name === 'AbortError' ? 'Cancelled.' : `Tool failed: ${(e as Error).message}`;
          store.logAudit({ actor: 'agent', kind: 'tool_call', name: def.name, invoice_id: invoiceId, args_summary: summarize(parsed.data), result_summary: msg, ok: false });
          return clamp({ error: msg });
        }
      },
  });
}

function summarize(v: unknown): string { const s = JSON.stringify(v) ?? ''; return s.length > 200 ? s.slice(0, 197) + '...' : s; }
```

`WebMCPProvider.tsx`:
```tsx
'use client';
export function WebMCPProvider() {
  const isOpen = useStore(s => s.openInvoiceId !== null);
  const setAvail = useStore(s => s.setWebmcpAvailable);
  useEffect(() => {
    const ok = isWebMCPAvailable(); setAvail(ok); if (!ok) return;
    const c = new AbortController(); registerTools(QUEUE_TOOLS, c.signal); return () => c.abort();
  }, []);
  useEffect(() => {
    if (!isOpen || !isWebMCPAvailable()) return;
    const c = new AbortController(); registerTools(INVOICE_TOOLS, c.signal); return () => c.abort();
  }, [isOpen]);
  return null;
}
```
Mount it once in `Workbench`. React StrictMode double-invoke in dev is handled by the abort cleanup.

---

## 10. Tool contracts (13)

Conventions: every tool's `input` is a `z.object` with `.describe()` on each param. Outputs listed are the object `execute` returns before stringification. "Open invoice" means `useStore.getState().openInvoiceId` resolved to an `InvoiceState`; if null, gated tools return `E_NO_OPEN`.

### Always registered (`lib/webmcp/tools/queue.ts`)

**1. `list_invoices`** — `readOnlyHint: true`
Description: `Lists invoices in the accounts-payable review queue with id, vendor, total, status, and count of open issues. Filter by status, vendor name, or minimum total. Use an id from the result with open_invoice to start reviewing.`
Input: `status?: enum(needs_review|flagged|held|approved|rejected)`, `vendor?: string` (case-insensitive substring of vendor name), `min_total?: number ≥ 0`, `limit?: int 1–20 default 10`.
Output: `{ count, invoices: [{ id, invoice_number, vendor, total, currency, status, open_issues, po_number|null, issue_date }] }` in queue order.

**2. `open_invoice`** — `readOnlyHint: true` (it changes what the reviewer sees but no business state)
Description: `Opens one invoice in the reviewer's workbench so both of you see the same document. Returns header fields, totals, PO number, low-confidence fields, open issues, and the tools that become available while an invoice is open.`
Input: `id: string`.
Effect: `openInvoice(id)`; queue scrolls to row; highlight cleared.
Output: `{ id, invoice_number, vendor, vendor_id, status, issue_date, due_date, po_number|null, subtotal, tax, total, currency, line_count, low_confidence_fields: [{field, confidence}] (confidence < 0.85), open_issues: [{id,type,severity}], tools_now_available: [9 names] }`.
Errors: `E_NOT_FOUND`.

**3. `get_review_summary`** — `readOnlyHint: true`
Description: `Returns queue totals: invoice counts by status, total value awaiting review, and how many invoices carry high-severity open issues. Useful at the start of a session and after decisions.`
Input: none (`z.object({})`).
Output: `{ by_status: {needs_review, flagged, held, approved, rejected}, pending_count, pending_total, high_severity_invoices, next_invoice_id|null }`. Pending = needs_review + flagged.

**4. `get_decision`** — `readOnlyHint: true`
Description: `Returns the current state of a countersign decision by decision_id: the requested action, the reviewer's outcome (pending, approved, held, rejected, dismissed), timestamps, and the suggested next invoice id.`
Input: `decision_id: string`.
Output: `{ decision_id, invoice_id, requested_action, outcome, requested_at, resolved_at|null, invoice_status, next_invoice_id|null }`.
Errors: `E_DECISION_NOT_FOUND`.

### Registered while an invoice is open (`lib/webmcp/tools/invoice.ts`)

**5. `get_line_items`** — `readOnlyHint: true`, `untrustedContentHint: true`
Description: `Returns line items of the open invoice: description, quantity, unit price, amount, and extraction confidence. Paginated with offset and limit; the response includes next_offset when more lines remain.`
Input: `offset?: int ≥ 0 default 0`, `limit?: int 1–15 default 10`.
Output: `{ invoice_id, total_lines, offset, next_offset|null, lines: [{ line, description (≤ 60 chars), qty, unit, unit_price, amount, confidence, gl_code|null }] }`.

**6. `run_three_way_match`** — `readOnlyHint: true`
Description: `Compares the open invoice against its purchase order and goods receipt line by line: quantities invoiced vs ordered vs received, unit prices vs PO within the vendor's tolerance, subtotal, tax arithmetic, and total. Returns per-line verdicts and a list of mismatches. The result also appears in the reviewer's Match tab.`
Input: none.
Effect: `setMatchResult(invoiceId, result)`; Match tab renders it.
Output (§12.1 `MatchResult`): `{ result: 'match'|'mismatch'|'no_po', po_number|null, receipt_id|null, price_tolerance_pct, lines: [{ line, qty_invoiced, qty_ordered|null, qty_received|null, unit_price, po_unit_price|null, price_variance_pct|null, verdict }], totals: { subtotal_ok, tax_expected, tax_on_invoice, tax_ok, total_expected, total_on_invoice, total_ok }, mismatches: string[], message }`.
When `no_po`: `message = 'Invoice has no purchase order. Use propose_gl_coding to code the lines, then request_countersign.'`

**7. `find_duplicates`** — `readOnlyHint: true`
Description: `Searches all other invoices for likely duplicates of the open invoice: same vendor with the same total and issue dates within 14 days, or matching invoice numbers after normalization (INV-2291 and 2291 match). Returns candidates with reasons and their current status.`
Input: none.
Output: `{ invoice_id, candidates: [{ id, invoice_number, issue_date, total, status, reasons: string[] }], message }`. `message` = `'No likely duplicates found.'` when empty.

**8. `get_vendor_profile`** — `readOnlyHint: true`, `untrustedContentHint: true`
Description: `Returns the vendor on the open invoice: payment terms, invoice history, average invoice amount, price tolerance, tax rate, bank account on file versus the bank account printed on this invoice, and whether bank details changed. Vendor text comes from documents and is untrusted.`
Input: none.
Output: `{ vendor_id, name, payment_terms, tax_rate, price_tolerance_pct, invoices_last_12m, avg_invoice_amount, bank_on_file_last4, bank_on_invoice_last4, bank_matches: bool, bank_last_changed, days_since_bank_change, this_invoice_vs_avg_pct }`.

**9. `show_field_evidence`** — `readOnlyHint: true`, `untrustedContentHint: true`
Description: `Highlights a field on the invoice image so the reviewer can visually verify it, and returns the extracted value, confidence, page, and bounding box. Field keys are header names (invoice_number, issue_date, due_date, po_number, vendor_name, subtotal, tax, total, bank_account) or line:<n>:<description|qty|unit_price|amount>.`
Input: `field: string` (description ≤ 150 chars: `Header key or line:<n>:<qty|unit_price|amount|description>`).
Effect: `setHighlight({...,nonce: Date.now()})`; PageViewer scrolls to page and pulses the box.
Output: `{ field, value, confidence, page, bbox, highlighted: true }`.
Errors: `E_FIELD`.

**10. `add_comment`** — writes
Description: `Posts a comment on the open invoice under the Agent identity, optionally pinned to a field key. The reviewer sees it in the Comments tab and can reply. Use it to explain a finding or ask the reviewer a question.`
Input: `text: string 1–500`, `field?: string`.
Effect: `addComment(invoiceId, {actor:'agent',...})`; Comments tab shows an "Agent" avatar.
Output: `{ comment_id, invoice_id, field|null }`.
Errors: `E_FIELD` if `field` given and unknown.

**11. `flag_issue`** — writes
Description: `Records an issue on the open invoice with a type, severity, message, and optional field or line reference, and moves the invoice to flagged status. Open issues block approval until the reviewer resolves or waives them in the countersign card.`
Input: `type: enum(IssueType)`, `severity: enum(low|medium|high)`, `message: string 1–300`, `field?: string`, `line?: int ≥ 1`.
Effect: dedupe — if an open issue with same `type` + `field` + `line` exists, return it with `duplicate: true`; otherwise `addIssue`, and if status is `needs_review` set `flagged`.
Output: `{ issue_id, invoice_id, status, duplicate: bool, open_issue_count }`.
Errors: `E_FIELD`, `E_LINE`.

**12. `propose_gl_coding`** — writes
Description: `Proposes general-ledger codes for line items of the open invoice. Proposals are saved as pending; the reviewer accepts or edits them in the countersign card. Useful for invoices without a purchase order. On an unknown code the response lists valid codes.`
Input: `assignments: array 1–15 of { line: int ≥ 1, gl_code: string, note?: string ≤ 120 }`.
Effect: validate every line exists and every code is in `gl_codes.json`; `setGlProposals(invoiceId, proposals)` with `accepted:false`.
Output: `{ invoice_id, proposed: n, pending_human_acceptance: true, lines: [{line, gl_code, gl_name}] }`.
Errors: `E_GL` (lists valid codes), `E_LINE`. The whole call fails atomically on any invalid entry.

**13. `request_countersign`** — writes
Description: `Requests the reviewer's decision on the open invoice: approve, hold, or reject, with your rationale and the issue ids you considered. A card appears on screen and this call waits up to 25 seconds for the click. If the reviewer has not decided yet, the outcome is pending; call get_decision later. Repeat calls return the same pending decision.`
Input: `action: enum(approve|hold|reject)`, `rationale: string 1–400`, `issue_ids?: string[] ≤ 20`.
Behavior:
1. If a decision for this invoice has `outcome:'pending'`, return it (idempotent; do not create a second card).
2. `createDecision(...)`; card opens (§11).
3. Await `Promise.race([resolvedPromise(decision_id), timeout(25000), abort(signal)])`.
4. On resolve: return outcome. On timeout: return `outcome:'pending'` — the card stays open, nothing auto-approves. On abort: throw AbortError (wrapper returns `Cancelled.`; decision stays pending).
Output: `{ decision_id, invoice_id, requested_action, outcome, blockers: string[] (why Approve is disabled, e.g. "2 open issues", "3 lines without GL code"), invoice_status, next_invoice_id|null }`.
Errors: `E_NO_OPEN`.

`next_invoice_id` (`lib/domain/next.ts`): first id in `order` after the current one (wrapping) whose status is `needs_review` or `flagged`, else null.

---

## 11. Error strings (`lib/webmcp/errors.ts`) and the countersign card

```ts
export const E = {
  NO_OPEN: 'No invoice is open. Call open_invoice with an id from list_invoices.',
  NOT_FOUND: (id: string) => `Invoice "${id}" not found. Call list_invoices to see valid ids.`,
  DECISION_NOT_FOUND: (id: string) => `Decision "${id}" not found. Use the decision_id returned by request_countersign.`,
  FIELD: (key: string, valid: string[]) => `Unknown field "${key}". Valid keys: ${valid.join(', ')}.`,
  LINE: (n: number, total: number) => `Line ${n} does not exist. This invoice has ${total} lines (1–${total}).`,
  GL: (code: string, valid: string[]) => `Unknown GL code "${code}". Valid codes: ${valid.join(', ')}.`,
};
```

**CountersignCard** (`components/CountersignCard.tsx`) renders when a pending decision exists for the open invoice:
- Header: "Agent requests: APPROVE / HOLD / REJECT" with rationale.
- Issues list: each open issue with buttons **Mark fixed** and **Waive** (waive requires a reason ≤ 120 chars). Resolved issues shown struck-through.
- GL proposals table (only for lines lacking a PO match or when proposals exist): searchable `<select>` from `gl_codes.json`; **Accept** per row or **Accept all**.
- Buttons: **Approve**, **Hold**, **Reject**, **Dismiss**.
  - Approve enabled only when `openIssues.length === 0` AND (`match_result?.result === 'match'` OR every line has an accepted GL code).
  - Hold / Reject / Dismiss always enabled.
- On click: `resolveDecision(id, outcome)`; `setStatus(invoiceId, approved|held|rejected)` (Dismiss leaves status unchanged); `logAudit({actor:'human', kind:'ui_action', name:'countersign_'+outcome, ...})`; resolve the awaiting promise; card closes.
- The card must feel weighty: full-width bottom sheet, amber border, the action word large.

A module-level `Map<string, (d: Decision) => void>` in `lib/webmcp/tools/invoice.ts` holds resolvers; `resolveDecision` in the store calls `notifyDecisionResolved(id)` which invokes and deletes the resolver.

---

## 12. Domain logic (`lib/domain/*`, pure, unit-tested)

### 12.1 `match.ts` — `threeWayMatch(invoice, po|undefined, receipt|undefined, vendor): MatchResult`
- No `po_number` or PO not found → `result:'no_po'`.
- Line matching: `normalize(desc)` (lowercase, strip punctuation, collapse whitespace, split on spaces) and Jaccard token overlap with each unmatched PO line; take the best ≥ 0.5; otherwise fall back to the same line index if still unmatched; otherwise `verdict:'line_not_on_po'`.
- Per-line verdict priority: `qty_over_received` (qty_invoiced > qty_received) → `qty_over_ordered` → `price_over_tolerance` (|(unit_price − po_price)/po_price| × 100 > `price_tolerance_pct`, rounded to 2 dp; if `po_price === 0`, the verdict is `price_over_tolerance` iff `unit_price !== 0` and `price_variance_pct` is `null`) → `ok`.
- Totals: `subtotal_ok` = |Σ amounts − subtotal| ≤ 0.01. `tax_expected` = round(subtotal × tax_rate, 2); `tax_ok` = |tax_expected − tax| ≤ 0.01. `total_expected` = subtotal + tax_expected; `total_ok` = |total_expected − total| ≤ 0.01.
- `mismatches`: one short string per non-ok verdict and per failed total, e.g. `Line 1: invoiced 120, received 100`, `Tax printed 188.00, expected 187.98`.
- `result` = `'match'` iff no mismatches.

### 12.2 `duplicates.ts` — `findDuplicates(target, all): Candidate[]`
- `normalizeInvoiceNumber`: lowercase, strip non-alphanumerics, strip a leading alphabetic prefix, strip leading zeros. `INV-2291` → `2291`; `NP-88120` → `88120`.
- Candidate if same `vendor_id` AND ((|total diff| ≤ 0.01 AND |date diff| ≤ 14 days) OR normalized numbers equal). Exclude the target itself. Reasons: `same_total`, `within_14_days`, `same_number_normalized`, `same_po`.

### 12.3 `tax.ts` — `expectedTax(subtotal, rate)` and `checkTax(...)` used by match.

### 12.4 `normalize.ts` — text helpers, plus `escapeText()` used by UI for any document-derived string.

---

## 13. UI spec

**Layout:** `Workbench` = header (56px) + `grid grid-cols-[300px_1fr_400px]` filling the viewport; each column scrolls independently. Below 1100px stack vertically (judges will use desktop; mobile is secondary).

**Header:** wordmark "Countersign", subtitle "agent-native invoice review", counts pill (`3 to review · 1 flagged · 2 approved`), WebMCP status pill (green "Site tools active · N registered" / grey "WebMCP not detected"), **Reset demo** button (confirm dialog → `reset()`).

**WebMCPBanner:** only when `webmcpAvailable === false`. Text: "This page exposes WebMCP tools. Open it in the ChatGPT desktop app's built-in browser, or in Chrome 149+ with chrome://flags/#enable-webmcp-testing enabled, and ask the agent to work through the queue." Everything still works manually.

**Queue:** rows: invoice number, vendor, total, status chip, open-issue count badge. Click → `openInvoice`. Active row has a left accent bar. Chips: needs_review slate, flagged amber, held yellow, approved green, rejected red — all with dark text on light fill (AA contrast).

**PageViewer:** page image at fit-width with `position:relative` wrapper; overlays are `div`s positioned by `left: x0*100%`, `top: y0*100%`, `width: (x1-x0)*100%`, `height: (y1-y0)*100%`. Default: no visible boxes; a "Show all fields" toggle outlines every field faintly. Highlight: 2px amber outline + amber 15% fill + `animate-pulse` for 1.8 s, then steady; `scrollIntoView({block:'center'})` on `highlight.nonce` change. Clicking a field in FieldsTab also highlights (human path, logged as `ui_action`). Empty state when nothing is open: "Pick an invoice, or ask the agent to work through the queue."

**InspectorTabs:** Fields · Lines · Match · Comments · Audit. Badge counts on Comments (unread agent comments) and Audit (entries).
- Fields: key, value (escaped), confidence bar (red < 0.85), "Show" button.
- Lines: table with GL column showing accepted code or pending proposal (dashed).
- Match: result banner, per-line verdict rows with colored verdict chips, totals block, mismatches list. Empty state: "Ask the agent to run a three-way match, or run it manually" (manual button calls the same domain function and logs `ui_action`).
- Comments: thread; Agent entries have a distinct avatar and label "Agent"; reply box for the human.
- Audit: newest first, monospace, actor badge (agent blue / human green / system grey), name, args summary, result summary, duration. "Export JSON" downloads the log.

**Manual parity:** every agent action has a human equivalent button (run match, find duplicates, add comment, flag issue, request decision opens the card with the human as requester). Judges without WebMCP must still see a complete product.

**Contrast:** all text ≥ 4.5:1. No white text on light chips. Check amber highlight text is dark.

---

## 14. Data generation (`scripts/gen/`)

`generate.py` produces, for each scenario in `templates.py`: `out/<id>.pdf`, `public/invoices/<id>/page-1.png` (150 dpi, 1275×1650), and `data/invoices/<id>.json`. Also writes `data/vendors.json`, `data/pos.json`, `data/receipts.json`, `data/gl_codes.json` from the tables in §6–7.

- Page: US Letter (612×792 pt). Two templates: **A** (Helvetica, right-aligned meta block, grey header band) for apex/harbor/cobalt; **B** (Times-Roman, boxed meta table) for northwind/lumen.
- Logo: PIL-generated 300×90 rectangle with vendor initials, saved JPEG quality 55, drawn at 150 dpi so it looks scanned.
- Stamp: PIL PNG "RECEIVED" + date, red, alpha 0.55, rotated 12°, drawn on inv_001 (blank area), inv_005 (over due_date), inv_008 (over tax).
- **Bboxes are recorded at draw time**, not searched afterward: for each field, `w = pdfmetrics.stringWidth(text, font, size)`, `x0 = x`, `x1 = x + w`, `y_top = page_h - (y_baseline + 0.8*size)`, `y_bottom = page_h - (y_baseline - 0.25*size)`; normalize by 612 and 792. Right-aligned text: `x0 = x_right - w`.
- Confidence: `0.93 + (zlib.crc32((id + field).encode()) % 700) / 10000` unless overridden by the scenario table. Do not use Python's built-in `hash()` — it is salted per process and would make output non-deterministic.
- `debug_overlay.py` draws every bbox on a copy of each PNG into `scripts/gen/out/debug/`. The human eyeballs these once. Any box off by more than 2 px at 150 dpi means the y-formula constants need tuning — tune, don't skew.
- Deterministic: no randomness except the seeded hash. Running twice yields identical files.

---

## 15. Tests (`vitest`)

- `match.test.ts`: fixtures for inv_001 (match), inv_002 (`qty_over_received` line 1), inv_003 (`price_over_tolerance` 4.13%), inv_006 (`no_po`), inv_008 (`tax_ok:false`, expected 187.98).
- `duplicates.test.ts`: inv_004b finds inv_004a with `same_number_normalized`, `same_total`, `within_14_days`, `same_po`; inv_001 finds none; `normalizeInvoiceNumber('INV-2291') === '2291'`.
- `tax.test.ts`: rounding edge cases (`.005` boundaries).
- `tools.test.ts`: seed the store from `data/`; for **every** tool × **every** invoice, call `execute` with minimal valid input and assert `clamp(result).length ≤ 1500`; assert `E.NO_OPEN` from each gated tool when nothing is open; assert `get_line_items` pagination (`limit:1` → `next_offset:1`); assert `flag_issue` dedupe; assert `propose_gl_coding` rejects `"9999"` with the valid list; assert `request_countersign` returns the same `decision_id` on a repeat call while pending (use a 50 ms timeout injected via an optional `ctx.timeoutMs` for tests); assert no path other than `resolveDecision` sets `approved` (grep-style test on `lib/` source for `'approved'` assignments outside the allowed file).
- Also a budget test: every tool's name/description/param descriptions under limits (this is what `defineTool` throws on in dev; the test asserts it for CI).

---

## 16. `evals/scenarios.json`

```json
[
  { "id": "queue_overview", "prompt": "What's waiting in my review queue and how much is it worth?",
    "expected_tools": ["get_review_summary", "list_invoices"], "expected_outcome": "counts and pending_total reported; no invoice opened" },
  { "id": "clean_approve", "prompt": "Review INV-10231 and tell me if it is safe to approve.",
    "expected_tools": ["open_invoice", "run_three_way_match", "find_duplicates", "request_countersign"], "expected_outcome": "request_countersign with action approve; card shows no blockers" },
  { "id": "qty_mismatch", "prompt": "Work through invoice NP-88120.",
    "expected_tools": ["open_invoice", "run_three_way_match", "show_field_evidence", "flag_issue", "request_countersign"], "expected_outcome": "qty_mismatch flagged on line 1 (120 vs 100 received); hold or reject requested" },
  { "id": "price_variance", "prompt": "Is the Lumen Freight invoice priced correctly?",
    "expected_tools": ["list_invoices", "open_invoice", "run_three_way_match", "get_vendor_profile", "flag_issue"], "expected_outcome": "price_variance flagged, 4.13% vs 3% tolerance" },
  { "id": "duplicate", "prompt": "Check invoice 2291 from Apex before I pay it.",
    "expected_tools": ["list_invoices", "open_invoice", "find_duplicates", "flag_issue", "request_countersign"], "expected_outcome": "duplicate of INV-2291 (already approved) flagged high; reject requested" },
  { "id": "vendor_bank_change", "prompt": "Anything suspicious about the Harbor Office invoice HOI-3391?",
    "expected_tools": ["open_invoice", "get_vendor_profile", "show_field_evidence", "flag_issue", "add_comment"], "expected_outcome": "vendor_risk flagged: bank 8812 vs 5567 on file, changed 2026-07-28; agent asks reviewer to verify out-of-band" },
  { "id": "non_po_gl", "prompt": "Code the Cobalt Cloud invoice so I can approve it.",
    "expected_tools": ["open_invoice", "run_three_way_match", "get_line_items", "propose_gl_coding", "request_countersign"], "expected_outcome": "no_po; both lines proposed 6210; approve requested; card shows GL acceptance" },
  { "id": "tax_rounding", "prompt": "Double-check the tax on HOI-3402.",
    "expected_tools": ["open_invoice", "run_three_way_match", "show_field_evidence", "flag_issue"], "expected_outcome": "tax_error flagged low severity: printed 188.00 vs expected 187.98" },
  { "id": "full_queue", "prompt": "Work through my review queue. Ask me to countersign each one.",
    "expected_tools": ["get_review_summary", "list_invoices", "open_invoice", "run_three_way_match", "request_countersign", "get_decision"], "expected_outcome": "agent proceeds invoice by invoice using next_invoice_id; never claims approval without a human click" }
]
```
Run manually in ChatGPT desktop (GPT-5.6 Sol) and Chrome with the Model Context Tool Inspector extension. Record pass/fail in `evals/RESULTS.md` (human).

---

## 17. README skeleton (`README.md`)

1. Title + one-line pitch + hero screenshot + live URL + video link
2. "Try it in 60 seconds": ChatGPT desktop path and Chrome flag path; three prompts to paste
3. What the agent can do (tool table: name, read/write, one line each)
4. How countersign works (the two-phase flow, why nothing auto-approves)
5. Why WebMCP and not a remote MCP server (shared page, evidence highlighting, signed-in session)
6. Architecture (registry wrapper, lifecycle, budgets, audit) with file links
7. Data: the eight scenarios table
8. Tests and evals: how to run
9. "What production would add": server-side auth, persistence, ERP sync, real OCR
10. Disclosure: `Synthetic documents were generated with a generator adapted from prior personal work. All application and WebMCP code was written during the submission period (Aug 25–Sep 3, 2026); see commit history.`
11. License MIT

---

## 18. Session plan for Claude Code

Run S1 in parallel with S0–S2. Each prompt below is self-contained; paste it as the first message of a fresh session.

**S0 — Scaffold (target 30 min)**
> Read CLAUDE.md fully. Scaffold the app per §4–§5 with `npx create-next-app@16.3.4` (TypeScript, App Router, Tailwind, ESLint, no src dir). Add zustand, zod, webmcp-types, vitest with the pinned versions. Create empty files for the layout in §5, `DECISIONS.md`, `PROGRESS.md`. Add `npm test` (vitest) and confirm `npm run build`, `npm test`, `npm run lint` all pass. Commit.
Acceptance: clean build; file tree matches §5.

**S1 — Data generation (Python, parallel)**
> Read CLAUDE.md §6, §7, §14. Implement `scripts/gen/templates.py`, `generate.py`, `debug_overlay.py`, `requirements.txt`. Produce all nine invoices, the four data JSON files, PNGs under `public/invoices/`, and debug overlays. Bboxes must be recorded at draw time as fractions. Print a table of fields with their bboxes for inv_002 at the end so a human can sanity-check it.
Acceptance: `python scripts/gen/generate.py` runs deterministically; every JSON validates against §6.5; debug overlays exist.

**S2 — Store + domain + tests**
> Read CLAUDE.md §8, §12, §15. Implement `lib/store.ts` with persist, `lib/seed.ts`, and all of `lib/domain/*`. Write `tests/match.test.ts`, `duplicates.test.ts`, `tax.test.ts` against the §7 fixtures (use `data/` once S1 has landed; otherwise inline fixtures with the exact §7 values). Enforce in code that only `resolveDecision` can set `approved`.
Acceptance: tests green; `threeWayMatch` returns the exact verdicts in §15.

**S3 — UI**
> Read CLAUDE.md §13. Build every component in §5 against the store. Manual parity for every agent action. Reset works. Contrast AA. No UI kits. Empty states everywhere. Countersign card per §11 including Approve gating.
Acceptance: full loop works with mouse only; queue chips update; highlight pulses and scrolls.

**S4 — WebMCP layer**
> Read CLAUDE.md §9, §10, §11. Implement `lib/webmcp/registry.ts` exactly as specified, `errors.ts`, `tools/queue.ts` (4), `tools/invoice.ts` (9), `WebMCPProvider.tsx`. Implement the two-phase countersign with the resolver map and 25 s timeout. Write `tests/tools.test.ts` per §15 including the budget test and the "every tool × every invoice ≤ 1500 chars" loop.
Acceptance: `document.modelContext.registerTool(` present; tools visible in Chrome DevTools → Application → WebMCP; gated tools appear on open and disappear on close; all tests green.

**S5 — Evals, README, polish**
> Read CLAUDE.md §16, §17. Write `evals/scenarios.json` verbatim from §16 and `README.md` from §17 with real file links. Add the WebMCP status pill, Export JSON for audit, and a 'Show all fields' toggle. Run lint/build/test.
Acceptance: README renders; every internal link resolves.

**S6 — Human-reported fixes**
> Here is what broke when I tested in ChatGPT desktop / Chrome: <paste>. Fix only these. Where the agent picked the wrong tool, improve descriptions by merging or clarifying — no negative instructions.

---

## 19. Human-only checklist (Claude Code cannot do these)

**Environment (do first — go/no-go):**
- [ ] Register at https://webmcp.devpost.com
- [ ] ChatGPT desktop app latest; built-in browser (`Cmd/Ctrl+Shift+B`); model GPT-5.6 Sol; Settings → Browser → Permissions → Enable site tools on
- [ ] Chrome 149+; `chrome://flags/#enable-webmcp-testing` Enabled; relaunch; install Model Context Tool Inspector extension
- [ ] Open https://googlechromelabs.github.io/webmcp-tools/demos/ pizza maker; confirm tools listed in DevTools → Application → WebMCP. **If no tools by H1, fix the environment before any coding.**
- [ ] Create GitHub repo (public), add MIT `LICENSE`, set license in About
- [ ] Vercel project; redeem $30 build credits at https://credits.vercel.sh/redeem code `OAIWEBMH-9E2F-MUT4`; deploy S0 hello page; open it in both browsers and confirm `document.modelContext` exists in the console
- [ ] Optional: $50 Render credits https://credits-portal-mmdm.onrender.com/claim/openai-hackathon (not needed)

**During build:**
- [ ] Eyeball `scripts/gen/out/debug/*.png` after S1 — every box on its text
- [ ] After S4: run all nine evals in ChatGPT desktop and in Chrome; write `evals/RESULTS.md`; feed failures to S6
- [ ] Verify the Site tools dropdown in the ChatGPT browser lists the tools; verify gated tools appear/disappear

**Ship:**
- [ ] Final deploy; test deployed URL in both browsers; tag `v1.0.0`
- [ ] Record video (script §20), voiceover only, export 1080p, upload YouTube **public**
- [ ] Devpost form: title "Countersign", tagline, description (§20), live URL, repo URL, video URL, screenshots (queue, highlight moment, countersign card, DevTools panel)
- [ ] Submit by **Sep 4, 00:00 IST**. Then touch nothing until winners are announced.

**Cut order if behind:** (1) drop `get_vendor_profile` + inv_005, (2) drop Comments tab, (3) reduce to five invoices. Never cut countersign, evidence highlighting, or the audit log.

---

## 20. Submission text and video script (human owns `submission/`)

**Devpost description (four required questions):**

*Why WebMCP:* Structured extraction — amounts, quantities, invoice numbers — is exactly the data an agent should receive by tool call, not by reading a screenshot. A scanned invoice table is the worst possible actuation target on the web: dense, tabular, low contrast. Countersign exposes the extraction and the matching logic as 13 typed tools.

*Better UX:* The reviewer never re-types or re-computes. The agent never touches money without a click. Evidence appears where the reviewer is already looking — `show_field_evidence` draws the highlight on the page.

*What is now possible:* A remote MCP server cannot highlight a box on your screen inside your live signed-in session, and cannot make its approval wait for your click on the same page. WebMCP gives the agent and the reviewer one document, one state, one audit log.

*Implementation:* Imperative API only, registered in the top-level page. Four queue tools always on; nine invoice tools registered once when an invoice opens and aborted on close. Annotation hints (`readOnlyHint`, `untrustedContentHint`). Chrome's character budgets enforced in `defineTool`. Zod 4 schemas are the single source of truth: `z.toJSONSchema` for the advertised schema, `safeParse` plus business validation in code. Two-phase countersign: the tool waits 25 s for the human, otherwise returns `pending` for `get_decision` polling; repeat calls are idempotent; nothing auto-approves. Every call — agent and human — is in the audit log.

**Video (2:45, voiceover only):**
- 0:00 Queue on screen. "Reviewers verify numbers an agent reads perfectly. Agents approve things a human would catch in two seconds. Countersign splits the work."
- 0:20 ChatGPT desktop browser on the app. Type "Work through my review queue." Hold the Site tools dropdown open 3 s. Agent opens NP-88120, runs the match, flags the quantity mismatch.
- 0:50 `show_field_evidence` — highlight snaps to the quantity cell. "I can see it. 120 billed, 100 received." Agent comments as Agent; reviewer replies.
- 1:20 `request_countersign` → the card slides in. Click Hold. Tool resolves; chip flips to Held. Agent moves to 2291: duplicate of INV-2291, already approved. Then HOI-3391: bank account changed three weeks ago.
- 1:50 DevTools → Application → WebMCP: nine tools appear when an invoice opens, vanish on close. Audit tab streaming agent and human rows.
- 2:20 Repo: `lib/webmcp/tools/invoice.ts`, one `registerTool` call in `registry.ts`, `evals/scenarios.json`.
- 2:40 "The agent proposes. The human countersigns. Both are on the record."
