import { z } from 'zod';
import { defineTool, type AnyToolDef } from '@/lib/webmcp/registry';
import { useStore, type InvoiceState } from '@/lib/store';
import { E } from '@/lib/webmcp/errors';
import { STATUSES, type Status } from '@/lib/types';
import { isPending } from '@/lib/domain/next';
import { roundMoney } from '@/lib/domain/tax';
import { INVOICE_TOOL_NAMES } from '@/lib/webmcp/tools/invoice';
import { nextAfter, openIssues, vendorName } from '@/lib/webmcp/tools/common';

const LOW_CONFIDENCE = 0.85;

function queueRow(invoice: InvoiceState) {
  return {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    vendor: vendorName(invoice),
    total: invoice.total,
    currency: invoice.currency,
    status: invoice.status,
    open_issues: openIssues(invoice).length,
    po_number: invoice.po_number ?? null,
    issue_date: invoice.issue_date,
  };
}

export const listInvoices = defineTool({
  name: 'list_invoices',
  description:
    'Lists invoices in the accounts-payable review queue with id, vendor, total, status, and count of open issues. Filter by status, vendor name, or minimum total. Use an id from the result with open_invoice to start reviewing.',
  input: z.object({
    status: z.enum(STATUSES).optional().describe('Only invoices with this status: needs_review, flagged, held, approved, or rejected.'),
    vendor: z.string().min(1).optional().describe('Case-insensitive substring of the vendor name, for example "apex".'),
    min_total: z.number().min(0).optional().describe('Only invoices whose total is at least this amount.'),
    limit: z.int().min(1).max(20).default(10).describe('Maximum number of invoices to return, 1 to 20.'),
  }),
  annotations: { readOnlyHint: true },
  execute: async ({ status, vendor, min_total, limit }) => {
    const state = useStore.getState();
    const needle = vendor?.toLowerCase();
    const rows = state.order
      .map((id) => state.invoices[id])
      .filter((inv) => !status || inv.status === status)
      .filter((inv) => !needle || vendorName(inv).toLowerCase().includes(needle))
      .filter((inv) => min_total === undefined || inv.total >= min_total)
      .map(queueRow);
    return { count: rows.length, invoices: rows.slice(0, limit) };
  },
});

export const openInvoice = defineTool({
  name: 'open_invoice',
  description:
    "Opens one invoice in the reviewer's workbench so both of you see the same document. Returns header fields, totals, PO number, low-confidence fields, open issues, and the tools that become available while an invoice is open.",
  input: z.object({ id: z.string().min(1).describe('Invoice id from list_invoices, for example inv_002.') }),
  annotations: { readOnlyHint: true },
  execute: async ({ id }) => {
    const state = useStore.getState();
    const invoice = state.invoices[id];
    if (!invoice) return { error: E.NOT_FOUND(id) };
    state.openInvoice(id);
    const low = Object.entries(invoice.fields)
      .filter(([, f]) => f.confidence < LOW_CONFIDENCE)
      .map(([field, f]) => ({ field, confidence: f.confidence }));
    return {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      vendor: vendorName(invoice),
      vendor_id: invoice.vendor_id,
      status: invoice.status,
      issue_date: invoice.issue_date,
      due_date: invoice.due_date,
      po_number: invoice.po_number ?? null,
      subtotal: invoice.subtotal,
      tax: invoice.tax,
      total: invoice.total,
      currency: invoice.currency,
      line_count: invoice.line_items.length,
      low_confidence_fields: low,
      open_issues: openIssues(invoice).map((i) => ({ id: i.id, type: i.type, severity: i.severity })),
      tools_now_available: INVOICE_TOOL_NAMES,
      review_flow:
        'run_three_way_match, find_duplicates, get_vendor_profile; show_field_evidence for each number you cite; flag_issue for each problem; finish with request_countersign.',
    };
  },
});

export const getReviewSummary = defineTool({
  name: 'get_review_summary',
  description:
    'Returns queue totals: invoice counts by status, total value awaiting review, and how many invoices carry high-severity open issues. Useful at the start of a session and after decisions.',
  input: z.object({}),
  annotations: { readOnlyHint: true },
  execute: async () => {
    const state = useStore.getState();
    const all = state.order.map((id) => state.invoices[id]);
    const by_status = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
    for (const inv of all) by_status[inv.status] += 1;
    const pending = all.filter((inv) => isPending(inv.status));
    return {
      by_status,
      pending_count: pending.length,
      pending_total: roundMoney(pending.reduce((sum, inv) => sum + inv.total, 0)),
      high_severity_invoices: all.filter((inv) => openIssues(inv).some((i) => i.severity === 'high')).length,
      next_invoice_id: nextAfter(state, state.openInvoiceId),
    };
  },
});

export const getDecision = defineTool({
  name: 'get_decision',
  description:
    "Returns the current state of a countersign decision by decision_id: the requested action, the reviewer's outcome (pending, approved, held, rejected, dismissed), timestamps, and the suggested next invoice id.",
  input: z.object({ decision_id: z.string().min(1).describe('The decision_id returned by request_countersign.') }),
  annotations: { readOnlyHint: true },
  execute: async ({ decision_id }) => {
    const state = useStore.getState();
    const decision = state.decisions[decision_id];
    if (!decision) return { error: E.DECISION_NOT_FOUND(decision_id) };
    return {
      decision_id: decision.id,
      invoice_id: decision.invoice_id,
      requested_action: decision.requested_action,
      outcome: decision.outcome,
      requested_at: decision.requested_at,
      resolved_at: decision.resolved_at ?? null,
      invoice_status: state.invoices[decision.invoice_id]?.status ?? null,
      next_invoice_id: nextAfter(state, decision.invoice_id),
    };
  },
});

export const QUEUE_TOOLS: AnyToolDef[] = [listInvoices, openInvoice, getReviewSummary, getDecision];
