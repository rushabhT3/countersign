'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { FieldsTab } from '@/components/tabs/FieldsTab';
import { LineItemsTab } from '@/components/tabs/LineItemsTab';
import { MatchTab } from '@/components/tabs/MatchTab';
import { CommentsTab } from '@/components/tabs/CommentsTab';
import { AuditTab } from '@/components/tabs/AuditTab';
import { ToolsTab } from '@/components/tabs/ToolsTab';
import { ManualActions } from '@/components/ManualActions';

export type InspectorTab = 'fields' | 'lines' | 'match' | 'comments' | 'audit' | 'tools';

const TABS: { id: InspectorTab; label: string; needsInvoice: boolean }[] = [
  { id: 'fields', label: 'Fields', needsInvoice: true },
  { id: 'lines', label: 'Lines', needsInvoice: true },
  { id: 'match', label: 'Match', needsInvoice: true },
  { id: 'comments', label: 'Comments', needsInvoice: true },
  { id: 'audit', label: 'Audit', needsInvoice: false },
  { id: 'tools', label: 'Tools', needsInvoice: false },
];

// Unread = agent comments posted since the Comments tab was last on screen for this invoice.
function useUnreadAgentComments(invoiceId: string | null, isViewing: boolean): number {
  const agentComments = useStore((s) => (invoiceId ? s.invoices[invoiceId].comments.filter((c) => c.actor === 'agent').length : 0));
  const [seen, setSeen] = useState({ invoiceId, count: 0 });
  if (seen.invoiceId !== invoiceId) setSeen({ invoiceId, count: 0 });
  else if (isViewing && seen.count !== agentComments) setSeen({ invoiceId, count: agentComments });
  return isViewing ? 0 : Math.max(0, agentComments - seen.count);
}

export function InspectorTabs() {
  const openInvoiceId = useStore((s) => s.openInvoiceId);
  const auditCount = useStore((s) => s.audit.length);
  const registeredCount = useStore((s) => s.registeredTools.length);
  const [tab, setTab] = useState<InspectorTab>('audit');
  const [tabInvoiceId, setTabInvoiceId] = useState(openInvoiceId);
  if (tabInvoiceId !== openInvoiceId) {
    setTabInvoiceId(openInvoiceId);
    setTab(openInvoiceId ? 'fields' : 'audit');
  }
  const unread = useUnreadAgentComments(openInvoiceId, tab === 'comments');

  const badges: Partial<Record<InspectorTab, number>> = { comments: unread, audit: auditCount, tools: registeredCount };

  return (
    <aside className="flex min-h-0 min-w-0 flex-col bg-panel min-[1100px]:border-l min-[1100px]:border-line" aria-label="Inspector">
      <nav className="flex shrink-0 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map(({ id, label, needsInvoice }) => {
          const isDisabled = needsInvoice && !openInvoiceId;
          const isActive = tab === id;
          const badge = badges[id];
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={isDisabled}
              onClick={() => setTab(id)}
              className={`relative flex-auto px-1.5 py-2.5 text-xs font-medium whitespace-nowrap ${
                isActive ? 'text-ink shadow-[inset_0_-2px_0_var(--color-accent-ring)]' : 'text-ink-muted hover:text-ink'
              } disabled:cursor-not-allowed disabled:text-ink-faint/60`}
            >
              {label}
              {badge ? (
                <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-px font-mono text-[10px] text-slate-800">{badge}</span>
              ) : null}
            </button>
          );
        })}
      </nav>
      {openInvoiceId && <ManualActions invoiceId={openInvoiceId} onShowTab={setTab} />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'fields' && openInvoiceId && <FieldsTab invoiceId={openInvoiceId} />}
        {tab === 'lines' && openInvoiceId && <LineItemsTab invoiceId={openInvoiceId} />}
        {tab === 'match' && openInvoiceId && <MatchTab invoiceId={openInvoiceId} />}
        {tab === 'comments' && openInvoiceId && <CommentsTab invoiceId={openInvoiceId} />}
        {tab === 'audit' && <AuditTab invoiceId={openInvoiceId} />}
        {tab === 'tools' && <ToolsTab />}
      </div>
    </aside>
  );
}
