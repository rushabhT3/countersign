'use client';

import { useState, type FormEvent } from 'react';
import { useStore, type RequestedAction } from '@/lib/store';
import { ISSUE_TYPES, SEVERITIES, type IssueType, type Severity } from '@/lib/types';
import { humanize } from '@/lib/ui/format';
import { findDuplicatesAsHuman, flagIssueAsHuman, requestDecisionAsHuman, runMatchAsHuman } from '@/lib/ui/manual';
import type { InspectorTab } from '@/components/InspectorTabs';

export interface ManualActionsProps {
  invoiceId: string;
  onShowTab: (tab: InspectorTab) => void;
}

type OpenForm = 'flag' | 'decide' | null;

const BUTTON = 'rounded-md border border-line bg-panel px-2 py-1 text-[11px] font-medium text-ink-muted hover:border-line-strong hover:text-ink';
const FIELD = 'rounded-md border border-line bg-panel px-2 py-1 text-xs';
const ACTIONS: RequestedAction[] = ['approve', 'hold', 'reject'];

function FlagIssueForm({ invoiceId, onDone }: { invoiceId: string; onDone: () => void }) {
  const lineCount = useStore((s) => s.invoices[invoiceId].line_items.length);
  const [type, setType] = useState<IssueType>('qty_mismatch');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [message, setMessage] = useState('');
  const [line, setLine] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    const lineNumber = line === '' ? undefined : Number(line);
    flagIssueAsHuman(invoiceId, { type, severity, message: message.trim(), line: lineNumber });
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
      <select value={type} onChange={(e) => setType(e.target.value as IssueType)} className={FIELD} aria-label="Issue type">
        {ISSUE_TYPES.map((t) => (
          <option key={t} value={t}>
            {humanize(t)}
          </option>
        ))}
      </select>
      <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)} className={FIELD} aria-label="Severity">
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select value={line} onChange={(e) => setLine(e.target.value)} className={FIELD} aria-label="Line">
        <option value="">no line</option>
        {Array.from({ length: lineCount }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n}>
            line {n}
          </option>
        ))}
      </select>
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        maxLength={300}
        placeholder="What is wrong?"
        className={`${FIELD} min-w-40 flex-1`}
        aria-label="Issue message"
      />
      <button type="submit" disabled={!message.trim()} className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-white disabled:bg-slate-300 disabled:text-slate-600">
        Flag
      </button>
    </form>
  );
}

function RequestDecisionForm({ invoiceId, onDone }: { invoiceId: string; onDone: () => void }) {
  const [action, setAction] = useState<RequestedAction>('approve');
  const [rationale, setRationale] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    requestDecisionAsHuman(invoiceId, action, rationale.trim() || 'Manual review.');
    onDone();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
      <select value={action} onChange={(e) => setAction(e.target.value as RequestedAction)} className={FIELD} aria-label="Requested action">
        {ACTIONS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <input
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        maxLength={400}
        placeholder="Rationale (optional)"
        className={`${FIELD} min-w-40 flex-1`}
        aria-label="Rationale"
      />
      <button type="submit" className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-white">
        Open card
      </button>
    </form>
  );
}

export function ManualActions({ invoiceId, onShowTab }: ManualActionsProps) {
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const hasPendingDecision = useStore((s) => Object.values(s.decisions).some((d) => d.invoice_id === invoiceId && d.outcome === 'pending'));
  const toggle = (form: OpenForm) => setOpenForm((current) => (current === form ? null : form));

  const handleRunMatchClick = () => {
    runMatchAsHuman(invoiceId);
    onShowTab('match');
  };

  const handleFindDuplicatesClick = () => {
    findDuplicatesAsHuman(invoiceId);
    onShowTab('match');
  };

  return (
    <div className="shrink-0 border-b border-line bg-panel-muted">
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
        <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Manual</span>
        <button type="button" className={BUTTON} onClick={handleRunMatchClick}>
          Run match
        </button>
        <button type="button" className={BUTTON} onClick={handleFindDuplicatesClick}>
          Find duplicates
        </button>
        <button type="button" className={BUTTON} onClick={() => toggle('flag')} aria-expanded={openForm === 'flag'}>
          Flag issue
        </button>
        <button type="button" className={BUTTON} onClick={() => onShowTab('comments')}>
          Comment
        </button>
        <button
          type="button"
          className={`${BUTTON} ${hasPendingDecision ? 'opacity-60' : ''}`}
          onClick={() => toggle('decide')}
          disabled={hasPendingDecision}
          aria-expanded={openForm === 'decide'}
          title={hasPendingDecision ? 'A decision card is already open' : 'Open the countersign card yourself'}
        >
          Request decision
        </button>
      </div>
      {openForm === 'flag' && <FlagIssueForm invoiceId={invoiceId} onDone={() => setOpenForm(null)} />}
      {openForm === 'decide' && <RequestDecisionForm invoiceId={invoiceId} onDone={() => setOpenForm(null)} />}
    </div>
  );
}
