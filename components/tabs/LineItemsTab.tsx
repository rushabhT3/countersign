'use client';

import type { ReactNode } from 'react';
import { useStore, type GlProposal } from '@/lib/store';
import { escapeText } from '@/lib/domain/normalize';
import { money, percent } from '@/lib/ui/format';
import { showFieldAsHuman } from '@/lib/ui/manual';
import { LINE_FIELD_COLUMNS, type LineFieldColumn } from '@/lib/types';

export interface LineItemsTabProps {
  invoiceId: string;
}

function GlCell({ proposal }: { proposal: GlProposal | undefined }) {
  if (!proposal) return <span className="text-ink-faint">—</span>;
  if (proposal.accepted) return <span className="rounded-sm bg-green-200 px-1.5 py-0.5 font-mono text-[11px] text-green-950">{proposal.gl_code}</span>;
  return (
    <span className="rounded-sm border border-dashed border-amber-600 px-1.5 py-0.5 font-mono text-[11px] text-amber-900" title="Proposed by the agent, awaiting acceptance">
      {proposal.gl_code} ?
    </span>
  );
}

interface EvidenceCellProps {
  invoiceId: string;
  line: number;
  column: LineFieldColumn;
  align?: 'right';
  children: ReactNode;
}

function EvidenceCell({ invoiceId, line, column, align, children }: EvidenceCellProps) {
  return (
    <td className={`px-2 py-2 ${align === 'right' ? 'text-right tabular-nums' : ''}`}>
      <button
        type="button"
        onClick={() => showFieldAsHuman(invoiceId, `line:${line}:${column}`)}
        className="rounded-sm decoration-dotted underline-offset-2 hover:underline"
        title={`Show line:${line}:${column} on the page`}
      >
        {children}
      </button>
    </td>
  );
}

export function LineItemsTab({ invoiceId }: LineItemsTabProps) {
  const invoice = useStore((s) => s.invoices[invoiceId]);
  const proposals = new Map(invoice.gl_proposals.map((p) => [p.line, p]));

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-panel-muted text-left text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th className="px-2 py-2 font-medium">#</th>
          <th className="px-2 py-2 font-medium">Description</th>
          <th className="px-2 py-2 text-right font-medium">Qty</th>
          <th className="px-2 py-2 text-right font-medium">Unit price</th>
          <th className="px-2 py-2 text-right font-medium">Amount</th>
          <th className="px-2 py-2 text-right font-medium">Conf.</th>
          <th className="px-2 py-2 font-medium">GL</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {invoice.line_items.map((item) => (
          <tr key={item.line}>
            <td className="px-2 py-2 text-ink-muted">{item.line}</td>
            <EvidenceCell invoiceId={invoiceId} line={item.line} column={LINE_FIELD_COLUMNS[0]}>
              {escapeText(item.description)}
            </EvidenceCell>
            <EvidenceCell invoiceId={invoiceId} line={item.line} column={LINE_FIELD_COLUMNS[1]} align="right">
              {item.qty} {escapeText(item.unit)}
            </EvidenceCell>
            <EvidenceCell invoiceId={invoiceId} line={item.line} column={LINE_FIELD_COLUMNS[2]} align="right">
              {money(item.unit_price, invoice.currency)}
            </EvidenceCell>
            <EvidenceCell invoiceId={invoiceId} line={item.line} column={LINE_FIELD_COLUMNS[3]} align="right">
              {money(item.amount, invoice.currency)}
            </EvidenceCell>
            <td className="px-2 py-2 text-right tabular-nums text-ink-muted">{percent(item.confidence)}</td>
            <td className="px-2 py-2">
              <GlCell proposal={proposals.get(item.line)} />
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot className="border-t border-line-strong text-xs">
        <tr>
          <td colSpan={4} className="px-2 py-1.5 text-right text-ink-muted">Subtotal</td>
          <td className="px-2 py-1.5 text-right tabular-nums">{money(invoice.subtotal, invoice.currency)}</td>
          <td colSpan={2} />
        </tr>
        <tr>
          <td colSpan={4} className="px-2 py-1.5 text-right text-ink-muted">Tax</td>
          <td className="px-2 py-1.5 text-right tabular-nums">{money(invoice.tax, invoice.currency)}</td>
          <td colSpan={2} />
        </tr>
        <tr className="font-medium">
          <td colSpan={4} className="px-2 py-1.5 text-right">Total</td>
          <td className="px-2 py-1.5 text-right tabular-nums">{money(invoice.total, invoice.currency)}</td>
          <td colSpan={2} />
        </tr>
      </tfoot>
    </table>
  );
}
