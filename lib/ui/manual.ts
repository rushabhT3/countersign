import { useStore, type DecisionOutcome, type Issue, type RequestedAction } from '@/lib/store';
import { threeWayMatch } from '@/lib/domain/match';
import { findDuplicates } from '@/lib/domain/duplicates';
import { purchaseOrderFor, receiptFor, vendorFor } from '@/lib/seed';
import { summarize } from '@/lib/webmcp/registry';
import { resolveField } from '@/lib/webmcp/tools/common';
import type { IssueType, Severity } from '@/lib/types';

// Every human action lands in the same audit log as the agent's tool calls, so the record reads
// as one timeline. These helpers are the manual counterparts of the WebMCP tools.
export function logHumanAction(name: string, invoiceId: string | undefined, args: unknown, result: string): void {
  useStore.getState().logAudit({
    actor: 'human',
    kind: 'ui_action',
    name,
    invoice_id: invoiceId,
    args_summary: summarize(args),
    result_summary: result,
    ok: true,
  });
}

export function openInvoiceAsHuman(id: string): void {
  useStore.getState().openInvoice(id);
  logHumanAction('open_invoice', id, { id }, 'Opened from the queue.');
}

export function closeInvoiceAsHuman(id: string): void {
  useStore.getState().closeInvoice();
  logHumanAction('close_invoice', id, { id }, 'Returned to the empty workbench.');
}

export function showFieldAsHuman(invoiceId: string, field: string): void {
  const state = useStore.getState();
  const invoice = state.invoices[invoiceId];
  const evidence = resolveField(invoice, field);
  if (!evidence) return;
  state.setHighlight({ invoice_id: invoiceId, field, page: evidence.page, bbox: evidence.bbox, nonce: Date.now() });
  logHumanAction('show_field_evidence', invoiceId, { field }, `Highlighted ${field} = ${evidence.value}.`);
}

export function runMatchAsHuman(invoiceId: string): void {
  const state = useStore.getState();
  const invoice = state.invoices[invoiceId];
  const result = threeWayMatch(invoice, purchaseOrderFor(invoice), receiptFor(invoice), vendorFor(invoice));
  state.setMatchResult(invoiceId, result);
  logHumanAction('run_three_way_match', invoiceId, {}, `${result.result}: ${result.message}`);
}

export function findDuplicatesAsHuman(invoiceId: string): void {
  const state = useStore.getState();
  const invoice = state.invoices[invoiceId];
  const candidates = findDuplicates(invoice, state.order.map((id) => state.invoices[id]));
  state.setDuplicateCheck(invoiceId, candidates);
  logHumanAction('find_duplicates', invoiceId, {}, `${candidates.length} candidate${candidates.length === 1 ? '' : 's'}.`);
}

export function addCommentAsHuman(invoiceId: string, text: string, field?: string): void {
  const comment = useStore.getState().addComment(invoiceId, { actor: 'human', text, field });
  logHumanAction('add_comment', invoiceId, { text, field }, `Posted ${comment.id}.`);
}

export interface ManualIssue {
  type: IssueType;
  severity: Severity;
  message: string;
  field?: string;
  line?: number;
}

export function flagIssueAsHuman(invoiceId: string, issue: ManualIssue): Issue {
  const state = useStore.getState();
  const created = state.addIssue(invoiceId, { ...issue, created_by: 'human' });
  if (state.invoices[invoiceId].status === 'needs_review') state.setStatus(invoiceId, 'flagged');
  logHumanAction('flag_issue', invoiceId, issue, `Recorded ${created.id}.`);
  return created;
}

export function resolveIssueAsHuman(invoiceId: string, issueId: string, resolution: 'fixed' | 'waived', reason?: string): void {
  useStore.getState().resolveIssue(invoiceId, issueId, resolution, reason);
  logHumanAction('resolve_issue', invoiceId, { issue_id: issueId, resolution, reason }, `${issueId} marked ${resolution}.`);
}

export function acceptGlAsHuman(invoiceId: string, line: number, code: string): void {
  useStore.getState().acceptGl(invoiceId, line, code);
  logHumanAction('accept_gl_code', invoiceId, { line, gl_code: code }, `Line ${line} coded ${code}.`);
}

export function requestDecisionAsHuman(invoiceId: string, action: RequestedAction, rationale: string): void {
  const state = useStore.getState();
  const pending = Object.values(state.decisions).find((d) => d.invoice_id === invoiceId && d.outcome === 'pending');
  if (pending) return;
  const decision = state.createDecision({ invoice_id: invoiceId, requested_by: 'human', requested_action: action, rationale, issue_ids: [] });
  logHumanAction('request_countersign', invoiceId, { action, rationale }, `Opened ${decision.id}.`);
}

export function logCountersign(decisionId: string, invoiceId: string, outcome: DecisionOutcome): void {
  const status = useStore.getState().invoices[invoiceId]?.status;
  logHumanAction(`countersign_${outcome}`, invoiceId, { decision_id: decisionId, outcome }, `Invoice now ${status}.`);
}

export function exportAuditAsHuman(): void {
  const { audit } = useStore.getState();
  const blob = new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `countersign-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  logHumanAction('export_audit', undefined, { entries: audit.length }, 'Downloaded the audit log as JSON.');
}
