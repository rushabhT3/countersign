import type { InvoiceState, Issue, Store } from '@/lib/store';
import type { MatchLine, MatchResult } from '@/lib/domain/match';
import type { IssueType, Severity } from '@/lib/types';
import { vendorFor } from '@/lib/seed';
import { LOW_CONFIDENCE, nextAfter, openInvoiceOf, openIssues } from '@/lib/webmcp/tools/common';

// Ready-to-paste inputs for each tool, built from what is on the reviewer's screen. They exist
// for people driving the tools by hand (Chrome's tool inspector); the agent never sees them.

export type ExampleInput = Record<string, unknown>;
export type ExampleState = Pick<Store, 'openInvoiceId' | 'invoices' | 'order' | 'decisions'>;

export interface SuggestedIssue {
  type: IssueType;
  severity: Severity;
  message: string;
  field?: string;
  line?: number;
}

const DEFAULT_GL_BY_VENDOR: Record<string, string> = {
  ven_apex: '5010',
  ven_northwind: '5020',
  ven_lumen: '5030',
  ven_cobalt: '6210',
  ven_harbor: '6120',
};
const FALLBACK_GL = '6900';
const COMMENT_TEXT = 'Please confirm this with the vendor before we pay.';
const CLEAN_RATIONALE = 'No open issues on this invoice.';
const DEFAULT_FIELD = 'total';
const LINE_ITEMS_PAGE = { offset: 0, limit: 10 };

export function exampleInput(name: string, state: ExampleState): ExampleInput | null {
  const invoice = openInvoiceOf(state);
  switch (name) {
    case 'list_invoices':
    case 'get_review_summary':
      return {};
    case 'open_invoice':
      return { id: state.openInvoiceId ?? nextAfter(state, null) ?? state.order[0] };
    case 'get_decision':
      return decisionExample(state, invoice);
    default:
      return invoice ? invoiceExample(name, invoice) : null;
  }
}

function decisionExample(state: ExampleState, invoice: InvoiceState | null): ExampleInput | null {
  const all = Object.values(state.decisions);
  const scoped = invoice ? all.filter((d) => d.invoice_id === invoice.id) : all;
  const latest = scoped.find((d) => d.outcome === 'pending') ?? scoped.at(-1) ?? all.at(-1);
  return latest ? { decision_id: latest.id } : null;
}

function invoiceExample(name: string, invoice: InvoiceState): ExampleInput | null {
  switch (name) {
    case 'get_line_items':
      return { ...LINE_ITEMS_PAGE };
    case 'run_three_way_match':
    case 'find_duplicates':
    case 'get_vendor_profile':
      return {};
    case 'show_field_evidence':
      return { field: focusField(invoice) };
    case 'add_comment':
      return { text: COMMENT_TEXT, field: focusField(invoice) };
    case 'flag_issue': {
      const issue = suggestedIssue(invoice);
      return issue ? { ...issue } : null;
    }
    case 'propose_gl_coding':
      return { assignments: glAssignments(invoice) };
    case 'request_countersign':
      return countersignExample(invoice);
    default:
      return null;
  }
}

// The field a reviewer would look at first: an open issue's field, else a finding from the checks
// already run, else the header field extraction was least sure about.
export function focusField(invoice: InvoiceState): string {
  const issue = openIssues(invoice)[0] ?? suggestedIssue(invoice);
  return (issue && issueField(issue)) ?? lowestConfidenceField(invoice) ?? DEFAULT_FIELD;
}

function issueField(issue: Pick<Issue, 'field' | 'line'>): string | null {
  if (issue.field) return issue.field;
  if (issue.line !== undefined) return `line:${issue.line}:qty`;
  return null;
}

export function lowestConfidenceField(invoice: Pick<InvoiceState, 'fields'>): string | null {
  const low = Object.entries(invoice.fields)
    .filter(([, f]) => f.confidence < LOW_CONFIDENCE)
    .sort(([, a], [, b]) => a.confidence - b.confidence);
  return low[0]?.[0] ?? null;
}

export function suggestedIssue(invoice: InvoiceState): SuggestedIssue | null {
  return issueFromMatch(invoice.match_result) ?? issueFromDuplicates(invoice) ?? issueFromVendor(invoice);
}

function issueFromMatch(match: MatchResult | undefined): SuggestedIssue | null {
  if (!match || match.result === 'no_po') return null;
  const line = match.lines.find((l) => l.verdict !== 'ok');
  if (line) return lineIssue(line, match.mismatches);
  if (!match.totals.tax_ok) {
    const message = match.mismatches.find((m) => m.startsWith('Tax ')) ?? 'Tax differs from the expected amount.';
    return { type: 'tax_error', severity: 'low', message, field: 'tax' };
  }
  return null;
}

function lineIssue(line: MatchLine, mismatches: string[]): SuggestedIssue {
  const message = mismatches.find((m) => m.startsWith(`Line ${line.line}:`)) ?? `Line ${line.line}: ${line.verdict}`;
  switch (line.verdict) {
    case 'price_over_tolerance':
      return { type: 'price_variance', severity: 'medium', message, line: line.line };
    case 'line_not_on_po':
      return { type: 'missing_po', severity: 'high', message, line: line.line };
    default:
      return { type: 'qty_mismatch', severity: 'high', message, line: line.line };
  }
}

function issueFromDuplicates(invoice: InvoiceState): SuggestedIssue | null {
  const candidate = invoice.duplicate_check?.candidates[0];
  if (!candidate) return null;
  const message = `Likely duplicate of ${candidate.invoice_number} (${candidate.status}): ${candidate.reasons.join(', ')}.`;
  return { type: 'duplicate', severity: 'high', message, field: 'invoice_number' };
}

function issueFromVendor(invoice: InvoiceState): SuggestedIssue | null {
  const vendor = vendorFor(invoice);
  if (vendor.bank_account_last4 === invoice.bank_account_last4_on_doc) return null;
  const message = `Bank ****${invoice.bank_account_last4_on_doc} on the invoice vs ****${vendor.bank_account_last4} on file; changed ${vendor.bank_last_changed}.`;
  return { type: 'vendor_risk', severity: 'high', message, field: 'bank_account' };
}

function glAssignments(invoice: InvoiceState): { line: number; gl_code: string }[] {
  const proposed = new Map(invoice.gl_proposals.map((p) => [p.line, p.gl_code]));
  const fallback = DEFAULT_GL_BY_VENDOR[invoice.vendor_id] ?? FALLBACK_GL;
  return invoice.line_items.map((l) => ({ line: l.line, gl_code: proposed.get(l.line) ?? fallback }));
}

function countersignExample(invoice: InvoiceState): ExampleInput {
  const issues = openIssues(invoice);
  const suggestion = suggestedIssue(invoice);
  if (issues.length === 0 && !suggestion) return { action: 'approve', rationale: CLEAN_RATIONALE, issue_ids: [] };
  const isDuplicate = issues.some((i) => i.type === 'duplicate') || suggestion?.type === 'duplicate';
  const rationale = issues[0]?.message ?? suggestion?.message ?? CLEAN_RATIONALE;
  return { action: isDuplicate ? 'reject' : 'hold', rationale, issue_ids: issues.map((i) => i.id) };
}
