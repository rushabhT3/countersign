'use client';

import { useState } from 'react';
import { useStore, type Decision, type InvoiceState, type Issue, type ResolvedOutcome } from '@/lib/store';
import { GL_CODES } from '@/lib/seed';
import { approvalBlockers } from '@/lib/domain/approval';
import { escapeText } from '@/lib/domain/normalize';
import { Chip } from '@/components/Chip';
import { severityTone } from '@/lib/ui/tones';
import { humanize, money } from '@/lib/ui/format';
import { acceptGlAsHuman, logCountersign, resolveIssueAsHuman, showFieldAsHuman } from '@/lib/ui/manual';
import { vendorName } from '@/lib/webmcp/tools/common';

const WAIVE_MAX = 120;

const ACTION_CLASSES: Record<Decision['requested_action'], string> = {
  approve: 'text-green-800',
  hold: 'text-yellow-800',
  reject: 'text-red-800',
};

const SMALL_BUTTON = 'rounded border border-line bg-panel px-1.5 py-0.5 text-[11px] font-medium hover:border-line-strong';

function IssueRow({ issue, invoiceId }: { issue: Issue; invoiceId: string }) {
  const [isWaiving, setIsWaiving] = useState(false);
  const [reason, setReason] = useState('');
  const reference = issue.line ? `line ${issue.line}` : issue.field;

  const handleWaiveConfirm = () => {
    if (!reason.trim()) return;
    resolveIssueAsHuman(invoiceId, issue.id, 'waived', reason.trim());
    setIsWaiving(false);
  };

  return (
    <li className={`flex flex-wrap items-center gap-2 py-1.5 text-xs ${issue.resolved ? 'text-ink-faint line-through' : ''}`}>
      <Chip tone={severityTone(issue.severity)}>{issue.severity}</Chip>
      <span className="font-medium">{humanize(issue.type)}</span>
      <span className="min-w-0 flex-1 break-words">{escapeText(issue.message)}</span>
      {reference && !issue.resolved && (
        <button type="button" className="font-mono text-[11px] text-amber-900 hover:underline" onClick={() => showFieldAsHuman(invoiceId, issue.field ?? `line:${issue.line}:qty`)}>
          {reference}
        </button>
      )}
      {issue.resolved ? (
        <span className="no-underline">{issue.resolution === 'waived' ? `waived: ${escapeText(issue.waive_reason ?? '')}` : 'fixed'}</span>
      ) : isWaiving ? (
        <span className="flex items-center gap-1">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={WAIVE_MAX}
            placeholder="Reason for waiving"
            className="rounded border border-line px-1.5 py-0.5 text-[11px]"
            aria-label="Waive reason"
          />
          <button type="button" className={SMALL_BUTTON} onClick={handleWaiveConfirm} disabled={!reason.trim()}>
            Confirm
          </button>
          <button type="button" className={SMALL_BUTTON} onClick={() => setIsWaiving(false)}>
            Cancel
          </button>
        </span>
      ) : (
        <span className="flex items-center gap-1">
          <button type="button" className={SMALL_BUTTON} onClick={() => resolveIssueAsHuman(invoiceId, issue.id, 'fixed')}>
            Mark fixed
          </button>
          <button type="button" className={SMALL_BUTTON} onClick={() => setIsWaiving(true)}>
            Waive
          </button>
        </span>
      )}
    </li>
  );
}

function GlProposals({ invoice }: { invoice: InvoiceState }) {
  const [selected, setSelected] = useState<Record<number, string>>({});
  const proposals = new Map(invoice.gl_proposals.map((p) => [p.line, p]));
  const codeFor = (line: number) => selected[line] ?? proposals.get(line)?.gl_code ?? '';
  const isDirty = (line: number) => {
    const proposal = proposals.get(line);
    return !proposal?.accepted || codeFor(line) !== proposal.gl_code;
  };
  const acceptable = invoice.line_items.filter((item) => codeFor(item.line) !== '' && isDirty(item.line));

  const handleAcceptAll = () => {
    for (const item of acceptable) acceptGlAsHuman(invoice.id, item.line, codeFor(item.line));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">GL coding</h3>
        <button type="button" className={SMALL_BUTTON} onClick={handleAcceptAll} disabled={acceptable.length === 0}>
          Accept all ({acceptable.length})
        </button>
      </div>
      <table className="mt-1 w-full text-xs">
        <tbody className="divide-y divide-line">
          {invoice.line_items.map((item) => {
            const proposal = proposals.get(item.line);
            const code = codeFor(item.line);
            return (
              <tr key={item.line}>
                <td className="py-1.5 pr-2 text-ink-muted">{item.line}</td>
                <td className="max-w-[260px] truncate py-1.5 pr-2">{escapeText(item.description)}</td>
                <td className="py-1.5 pr-2">
                  <select
                    value={code}
                    onChange={(e) => setSelected((s) => ({ ...s, [item.line]: e.target.value }))}
                    className="rounded border border-line bg-panel px-1.5 py-0.5 text-xs"
                    aria-label={`GL code for line ${item.line}`}
                  >
                    <option value="">— pick a code —</option>
                    {GL_CODES.map((g) => (
                      <option key={g.code} value={g.code}>
                        {g.code} · {g.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 text-right">
                  {proposal?.accepted && !isDirty(item.line) ? (
                    <Chip tone="green">accepted</Chip>
                  ) : (
                    <button type="button" className={SMALL_BUTTON} disabled={code === ''} onClick={() => acceptGlAsHuman(invoice.id, item.line, code)}>
                      Accept
                    </button>
                  )}
                  {proposal && !proposal.accepted && proposal.note && <div className="mt-0.5 text-[10px] text-ink-faint">{escapeText(proposal.note)}</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CountersignCard() {
  const invoice = useStore((s) => (s.openInvoiceId ? s.invoices[s.openInvoiceId] : null));
  const decision = useStore((s) =>
    invoice ? Object.values(s.decisions).find((d) => d.invoice_id === invoice.id && d.outcome === 'pending') ?? null : null,
  );
  const resolveDecision = useStore((s) => s.resolveDecision);
  if (!invoice || !decision) return null;

  const blockers = approvalBlockers(invoice);
  const showGl = invoice.match_result?.result !== 'match' || invoice.gl_proposals.length > 0;

  // The only place in the app that can produce an approved invoice: a reviewer's click here.
  const handleDecision = (outcome: ResolvedOutcome) => {
    resolveDecision(decision.id, outcome);
    logCountersign(decision.id, invoice.id, outcome);
  };

  return (
    <section
      className="sticky bottom-0 z-30 max-h-[60vh] shrink-0 animate-sheet-in overflow-y-auto border-t-4 border-accent-ring bg-panel shadow-[0_-12px_32px_rgba(0,0,0,0.14)]"
      aria-label="Countersign request"
      role="dialog"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4">
        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              {decision.requested_by === 'agent' ? 'Agent requests' : 'You requested'}
            </div>
            <div className={`text-3xl font-semibold uppercase tracking-tight ${ACTION_CLASSES[decision.requested_action]}`}>{decision.requested_action}</div>
            <p className="mt-1 max-w-2xl text-sm">{escapeText(decision.rationale)}</p>
          </div>
          <div className="text-right text-xs">
            <div className="font-mono text-sm font-medium">{escapeText(invoice.invoice_number)}</div>
            <div className="text-ink-muted">{escapeText(vendorName(invoice))}</div>
            <div className="mt-1 text-base tabular-nums">{money(invoice.total, invoice.currency)}</div>
          </div>
        </div>

        {invoice.issues.length > 0 && (
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Issues</h3>
            <ul className="divide-y divide-line">
              {invoice.issues.map((issue) => (
                <IssueRow key={issue.id} issue={issue} invoiceId={invoice.id} />
              ))}
            </ul>
          </div>
        )}

        {showGl && <GlProposals invoice={invoice} />}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <button
            type="button"
            disabled={blockers.length > 0}
            onClick={() => handleDecision('approved')}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            Approve
          </button>
          <button type="button" onClick={() => handleDecision('held')} className="rounded-md bg-yellow-300 px-4 py-2 text-sm font-semibold text-yellow-950 hover:bg-yellow-400">
            Hold
          </button>
          <button type="button" onClick={() => handleDecision('rejected')} className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800">
            Reject
          </button>
          <button type="button" onClick={() => handleDecision('dismissed')} className="rounded-md border border-line px-4 py-2 text-sm font-medium text-ink-muted hover:border-line-strong">
            Dismiss
          </button>
          <span className="ml-auto text-xs text-ink-muted">
            {blockers.length > 0 ? `Approve is disabled: ${blockers.join(', ')}.` : 'No blockers. Approving records your click in the audit log.'}
          </span>
        </div>
      </div>
    </section>
  );
}
