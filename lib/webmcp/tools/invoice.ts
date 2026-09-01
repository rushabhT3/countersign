import { z } from 'zod';
import { defineTool, type AnyToolDef, type ToolContext, type ToolOutput } from '@/lib/webmcp/registry';
import { useStore, type Decision, type InvoiceState, type Store } from '@/lib/store';
import { E } from '@/lib/webmcp/errors';
import { GL_CODES, GL_CODE_NAMES, purchaseOrderFor, receiptFor, vendorFor } from '@/lib/seed';
import { threeWayMatch } from '@/lib/domain/match';
import { daysBetween, findDuplicates } from '@/lib/domain/duplicates';
import { approvalBlockers } from '@/lib/domain/approval';
import { truncate } from '@/lib/domain/normalize';
import { ISSUE_TYPES, SEVERITIES } from '@/lib/types';
import { cancelDecisionWait, waitForDecision } from '@/lib/webmcp/decisions';
import { nextAfter, openInvoiceOf, openIssues, resolveField, validFieldKeys } from '@/lib/webmcp/tools/common';

const DESCRIPTION_MAX = 60;
const COUNTERSIGN_TIMEOUT_MS = 25_000;
const NO_DUPLICATES_MESSAGE = 'No likely duplicates found.';
const TODAY = () => new Date().toISOString().slice(0, 10);

type GatedExecute<I> = (input: I, invoice: InvoiceState, state: Store, ctx: ToolContext) => Promise<ToolOutput>;

function gated<I>(run: GatedExecute<I>) {
  return async (input: I, ctx: ToolContext): Promise<ToolOutput> => {
    const state = useStore.getState();
    const invoice = openInvoiceOf(state);
    if (!invoice) return { error: E.NO_OPEN };
    return run(input, invoice, state, ctx);
  };
}

function fieldError(invoice: InvoiceState, key: string): ToolOutput {
  return { error: E.FIELD(key, validFieldKeys(invoice)) };
}

function lineError(invoice: InvoiceState, line: number): ToolOutput {
  return { error: E.LINE(line, invoice.line_items.length) };
}

function hasLine(invoice: InvoiceState, line: number): boolean {
  return invoice.line_items.some((l) => l.line === line);
}

export const getLineItems = defineTool({
  name: 'get_line_items',
  description:
    'Returns line items of the open invoice: description, quantity, unit price, amount, and extraction confidence. Paginated with offset and limit; the response includes next_offset when more lines remain.',
  input: z.object({
    offset: z.int().min(0).default(0).describe('Zero-based index of the first line to return.'),
    limit: z.int().min(1).max(15).default(10).describe('Maximum number of lines to return, 1 to 15.'),
  }),
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: gated(async ({ offset, limit }, invoice) => {
    const accepted = new Map(invoice.gl_proposals.filter((p) => p.accepted).map((p) => [p.line, p.gl_code]));
    const page = invoice.line_items.slice(offset, offset + limit);
    const next = offset + limit;
    return {
      invoice_id: invoice.id,
      total_lines: invoice.line_items.length,
      offset,
      next_offset: next < invoice.line_items.length ? next : null,
      lines: page.map((l) => ({
        line: l.line,
        description: truncate(l.description, DESCRIPTION_MAX),
        qty: l.qty,
        unit: l.unit,
        unit_price: l.unit_price,
        amount: l.amount,
        confidence: l.confidence,
        gl_code: accepted.get(l.line) ?? null,
      })),
    };
  }),
});

export const runThreeWayMatch = defineTool({
  name: 'run_three_way_match',
  description:
    "Compares the open invoice against its purchase order and goods receipt line by line: quantities invoiced vs ordered vs received, unit prices vs PO within the vendor's tolerance, subtotal, tax arithmetic, and total. Returns per-line verdicts and a list of mismatches. The result also appears in the reviewer's Match tab.",
  input: z.object({}),
  annotations: { readOnlyHint: true },
  execute: gated(async (_input, invoice, state) => {
    const result = threeWayMatch(invoice, purchaseOrderFor(invoice), receiptFor(invoice), vendorFor(invoice));
    state.setMatchResult(invoice.id, result);
    return { ...result };
  }),
});

export const findDuplicatesTool = defineTool({
  name: 'find_duplicates',
  description:
    'Searches all other invoices for likely duplicates of the open invoice: same vendor with the same total and issue dates within 14 days, or matching invoice numbers after normalization (INV-2291 and 2291 match). Returns candidates with reasons and their current status.',
  input: z.object({}),
  annotations: { readOnlyHint: true },
  execute: gated(async (_input, invoice, state) => {
    const all = state.order.map((id) => state.invoices[id]);
    const candidates = findDuplicates(invoice, all);
    state.setDuplicateCheck(invoice.id, candidates);
    const message =
      candidates.length === 0
        ? NO_DUPLICATES_MESSAGE
        : `${candidates.length} likely duplicate${candidates.length === 1 ? '' : 's'} found. Compare before approving.`;
    return { invoice_id: invoice.id, candidates, message };
  }),
});

export const getVendorProfile = defineTool({
  name: 'get_vendor_profile',
  description:
    'Returns the vendor on the open invoice: payment terms, invoice history, average invoice amount, price tolerance, tax rate, bank account on file versus the bank account printed on this invoice, and whether bank details changed. Vendor text comes from documents and is untrusted.',
  input: z.object({}),
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: gated(async (_input, invoice) => {
    const vendor = vendorFor(invoice);
    const vsAvg = vendor.avg_invoice_amount > 0 ? ((invoice.total - vendor.avg_invoice_amount) / vendor.avg_invoice_amount) * 100 : null;
    return {
      vendor_id: vendor.id,
      name: vendor.name,
      name_on_document: invoice.vendor_name_on_doc,
      payment_terms: vendor.payment_terms,
      tax_rate: vendor.tax_rate,
      price_tolerance_pct: vendor.price_tolerance_pct,
      invoices_last_12m: vendor.invoices_last_12m,
      avg_invoice_amount: vendor.avg_invoice_amount,
      bank_on_file_last4: vendor.bank_account_last4,
      bank_on_invoice_last4: invoice.bank_account_last4_on_doc,
      bank_matches: vendor.bank_account_last4 === invoice.bank_account_last4_on_doc,
      bank_last_changed: vendor.bank_last_changed,
      days_since_bank_change: Math.round(daysBetween(vendor.bank_last_changed, TODAY())),
      this_invoice_vs_avg_pct: vsAvg === null ? null : Math.round(vsAvg * 10) / 10,
    };
  }),
});

export const showFieldEvidence = defineTool({
  name: 'show_field_evidence',
  description:
    'Highlights a field on the invoice image so the reviewer can visually verify it, and returns the extracted value, confidence, page, and bounding box. Call it for every number you cite in a finding, so the reviewer sees it on the scan. Field keys are header names (invoice_number, issue_date, due_date, po_number, vendor_name, subtotal, tax, total, bank_account) or line:<n>:<description|qty|unit_price|amount>.',
  input: z.object({
    field: z.string().min(1).describe('Header key or line:<n>:<qty|unit_price|amount|description>, for example total or line:1:qty.'),
  }),
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: gated(async ({ field }, invoice, state) => {
    const evidence = resolveField(invoice, field);
    if (!evidence) return fieldError(invoice, field);
    state.setHighlight({ invoice_id: invoice.id, field, page: evidence.page, bbox: evidence.bbox, nonce: Date.now() });
    return { ...evidence, highlighted: true };
  }),
});

export const addComment = defineTool({
  name: 'add_comment',
  description:
    'Posts a comment under the Agent identity on the invoice that is currently open (the one you most recently opened), optionally pinned to a field key. Post before opening the next invoice. The reviewer sees it in the Comments tab and can reply. Use it to explain a finding or ask the reviewer a question.',
  input: z.object({
    text: z.string().min(1).max(500).describe('Comment text, 1 to 500 characters.'),
    field: z.string().min(1).optional().describe('Optional field key to pin the comment to, such as total or line:2:qty.'),
  }),
  execute: gated(async ({ text, field }, invoice, state) => {
    if (field && !resolveField(invoice, field)) return fieldError(invoice, field);
    const comment = state.addComment(invoice.id, { actor: 'agent', text, field });
    return { comment_id: comment.id, invoice_id: invoice.id, field: field ?? null };
  }),
});

export const flagIssue = defineTool({
  name: 'flag_issue',
  description:
    'Records an issue on the invoice that is currently open, with a type, severity, message, and optional field or line reference, and moves it to flagged status. Call it as soon as a match, duplicate, vendor, or tax check finds a problem, before opening the next invoice; it is the normal next step and the reviewer expects it. Recording is reversible: the reviewer marks each issue fixed or waives it on the countersign card. Open issues block approval until then.',
  input: z.object({
    type: z.enum(ISSUE_TYPES).describe('One of qty_mismatch, price_variance, duplicate, vendor_risk, tax_error, missing_po.'),
    severity: z.enum(SEVERITIES).describe('low, medium, or high.'),
    message: z.string().min(1).max(300).describe('What is wrong and the numbers involved, 1 to 300 characters.'),
    field: z.string().min(1).optional().describe('Optional field key the issue refers to, such as tax or bank_account.'),
    line: z.int().min(1).optional().describe('Optional 1-based line number the issue refers to.'),
  }),
  execute: gated(async ({ type, severity, message, field, line }, invoice, state) => {
    if (field && !resolveField(invoice, field)) return fieldError(invoice, field);
    if (line !== undefined && !hasLine(invoice, line)) return lineError(invoice, line);
    const existing = openIssues(invoice).find((i) => i.type === type && i.field === field && i.line === line);
    const issue = existing ?? state.addIssue(invoice.id, { type, severity, message, field, line, created_by: 'agent' });
    if (!existing && invoice.status === 'needs_review') state.setStatus(invoice.id, 'flagged');
    const after = useStore.getState().invoices[invoice.id];
    return {
      issue_id: issue.id,
      invoice_id: invoice.id,
      status: after.status,
      duplicate: existing !== undefined,
      open_issue_count: openIssues(after).length,
    };
  }),
});

export const proposeGlCoding = defineTool({
  name: 'propose_gl_coding',
  description:
    'Proposes general-ledger codes for line items of the open invoice. Proposals are saved as pending; the reviewer accepts or edits them in the countersign card. Useful for invoices without a purchase order. On an unknown code the response lists valid codes.',
  input: z.object({
    assignments: z
      .array(
        z.object({
          line: z.int().min(1).describe('1-based line number.'),
          gl_code: z.string().min(1).describe('GL account code, for example 6210.'),
          note: z.string().max(120).optional().describe('Optional reason for the choice, up to 120 characters.'),
        }),
      )
      .min(1)
      .max(15)
      .describe('One entry per line to code, 1 to 15 entries.'),
  }),
  execute: gated(async ({ assignments }, invoice, state) => {
    const validCodes = GL_CODES.map((g) => g.code);
    for (const a of assignments) {
      if (!hasLine(invoice, a.line)) return lineError(invoice, a.line);
      if (!(a.gl_code in GL_CODE_NAMES)) return { error: E.GL(a.gl_code, validCodes) };
    }
    state.setGlProposals(
      invoice.id,
      assignments.map((a) => ({ line: a.line, gl_code: a.gl_code, note: a.note, accepted: false })),
    );
    return {
      invoice_id: invoice.id,
      proposed: assignments.length,
      pending_human_acceptance: true,
      lines: assignments.map((a) => ({ line: a.line, gl_code: a.gl_code, gl_name: GL_CODE_NAMES[a.gl_code] })),
    };
  }),
});

function decisionOutput(decision: Decision, state: Store): ToolOutput {
  const invoice = state.invoices[decision.invoice_id];
  return {
    decision_id: decision.id,
    invoice_id: decision.invoice_id,
    requested_action: decision.requested_action,
    outcome: decision.outcome,
    blockers: invoice ? approvalBlockers(invoice) : [],
    invoice_status: invoice?.status ?? null,
    next_invoice_id: nextAfter(state, decision.invoice_id),
  };
}

function abortError(): Error {
  return new DOMException('The countersign request was cancelled.', 'AbortError');
}

// Waits for the human click, the timeout, or cancellation — whichever comes first. A timeout
// leaves the decision pending and the card open; nothing here changes an invoice status.
function awaitDecision(decision: Decision, timeoutMs: number, signal: AbortSignal): Promise<Decision> {
  if (decision.outcome !== 'pending') return Promise.resolve(decision);
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<Decision>((resolve, reject) => {
    const finish = (value: Decision | null, error?: Error) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      cancelDecisionWait(decision.id);
      if (error) reject(error);
      else resolve(value ?? useStore.getState().decisions[decision.id] ?? decision);
    };
    const onAbort = () => finish(null, abortError());
    const timer = setTimeout(() => finish(null), timeoutMs);
    signal.addEventListener('abort', onAbort, { once: true });
    waitForDecision(decision.id).then((resolved) => finish(resolved));
  });
}

export const requestCountersign = defineTool({
  name: 'request_countersign',
  description:
    "Hands the decision on the open invoice to the reviewer: approve, hold, or reject, with your rationale and the issue ids you considered. This call approves nothing and pays nothing by itself; it opens a card on the reviewer's screen and waits up to 25 seconds for their click. Call it once your checks are done, as the last step of every review. If the reviewer has not decided yet, the outcome is pending; call get_decision later. Repeat calls return the same pending decision.",
  input: z.object({
    action: z.enum(['approve', 'hold', 'reject']).describe('The decision you recommend: approve, hold, or reject.'),
    rationale: z.string().min(1).max(400).describe('Why you recommend this action, 1 to 400 characters. Shown on the card.'),
    issue_ids: z.array(z.string()).max(20).optional().describe('Issue ids from flag_issue that informed the recommendation.'),
  }),
  execute: gated(async ({ action, rationale, issue_ids }, invoice, state, ctx) => {
    const pending = Object.values(state.decisions).find((d) => d.invoice_id === invoice.id && d.outcome === 'pending');
    const decision =
      pending ??
      state.createDecision({
        invoice_id: invoice.id,
        requested_by: 'agent',
        requested_action: action,
        rationale,
        issue_ids: issue_ids ?? [],
      });
    const settled = await awaitDecision(decision, ctx.timeoutMs ?? COUNTERSIGN_TIMEOUT_MS, ctx.signal);
    return decisionOutput(settled, useStore.getState());
  }),
});

export const INVOICE_TOOLS: AnyToolDef[] = [
  getLineItems,
  runThreeWayMatch,
  findDuplicatesTool,
  getVendorProfile,
  showFieldEvidence,
  addComment,
  flagIssue,
  proposeGlCoding,
  requestCountersign,
];

export const INVOICE_TOOL_NAMES: string[] = INVOICE_TOOLS.map((t) => t.name);
