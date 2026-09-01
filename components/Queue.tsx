'use client';

import { useEffect, useRef } from 'react';
import { useStore, type InvoiceState } from '@/lib/store';
import { Chip } from '@/components/Chip';
import { statusTone } from '@/lib/ui/tones';
import { money, statusLabel } from '@/lib/ui/format';
import { openInvoiceAsHuman } from '@/lib/ui/manual';
import { vendorName } from '@/lib/webmcp/tools/common';
import { openIssueCount } from '@/lib/domain/approval';

interface QueueRowProps {
  invoice: InvoiceState;
  isActive: boolean;
}

function QueueRow({ invoice, isActive }: QueueRowProps) {
  const rowRef = useRef<HTMLLIElement>(null);
  const issues = openIssueCount(invoice);

  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isActive]);

  const handleRowClick = () => {
    if (!isActive) openInvoiceAsHuman(invoice.id);
  };

  return (
    <li ref={rowRef}>
      <button
        type="button"
        onClick={handleRowClick}
        aria-current={isActive ? 'true' : undefined}
        className={`flex w-full flex-col gap-1 border-l-2 px-3 py-2.5 text-left hover:bg-panel-muted ${
          isActive ? 'border-accent-ring bg-accent-soft/60' : 'border-transparent'
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="font-mono text-[13px] font-medium">{invoice.invoice_number}</span>
          <span className="text-[13px] tabular-nums">{money(invoice.total, invoice.currency)}</span>
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-ink-muted">{vendorName(invoice)}</span>
          <span className="flex items-center gap-1.5">
            {issues > 0 && (
              <span
                className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-black"
                title={`${issues} open issue${issues === 1 ? '' : 's'}`}
              >
                {issues}
              </span>
            )}
            <Chip tone={statusTone(invoice.status)}>{statusLabel(invoice.status)}</Chip>
          </span>
        </span>
      </button>
    </li>
  );
}

export function Queue() {
  const order = useStore((s) => s.order);
  const invoices = useStore((s) => s.invoices);
  const openInvoiceId = useStore((s) => s.openInvoiceId);

  return (
    <aside className="flex min-h-0 flex-col border-b border-line bg-panel min-[1100px]:border-r min-[1100px]:border-b-0" aria-label="Review queue">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Queue</h2>
        <span className="text-xs text-ink-faint">{order.length} invoices</span>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        {order.map((id) => (
          <QueueRow key={id} invoice={invoices[id]} isActive={id === openInvoiceId} />
        ))}
      </ul>
    </aside>
  );
}
