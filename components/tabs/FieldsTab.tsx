'use client';

import { useStore } from '@/lib/store';
import { HEADER_FIELD_KEYS } from '@/lib/types';
import { escapeText } from '@/lib/domain/normalize';
import { humanize, percent } from '@/lib/ui/format';
import { showFieldAsHuman } from '@/lib/ui/manual';

const LOW_CONFIDENCE = 0.85;

export interface FieldsTabProps {
  invoiceId: string;
}

export function FieldsTab({ invoiceId }: FieldsTabProps) {
  const fields = useStore((s) => s.invoices[invoiceId].fields);
  const highlighted = useStore((s) => (s.highlight?.invoice_id === invoiceId ? s.highlight.field : null));
  const rows = HEADER_FIELD_KEYS.flatMap((key) => {
    const field = fields[key];
    return field ? [{ key, ...field }] : [];
  });

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-panel-muted text-left text-[11px] uppercase tracking-wider text-ink-muted">
        <tr>
          <th className="px-3 py-2 font-medium">Field</th>
          <th className="px-3 py-2 font-medium">Value</th>
          <th className="px-3 py-2 font-medium">Conf.</th>
          <th className="px-3 py-2" />
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((row) => {
          const isLow = row.confidence < LOW_CONFIDENCE;
          return (
            <tr key={row.key} className={highlighted === row.key ? 'bg-accent-soft/60' : ''}>
              <td className="px-3 py-2 text-ink-muted">{humanize(row.key)}</td>
              <td className="px-3 py-2 font-mono break-words">{escapeText(row.value)}</td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5" title={`Extraction confidence ${percent(row.confidence)}`}>
                  <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full ${isLow ? 'bg-red-600' : 'bg-green-700'}`} style={{ width: percent(row.confidence) }} />
                  </div>
                  <span className={`tabular-nums ${isLow ? 'font-medium text-red-800' : 'text-ink-muted'}`}>{percent(row.confidence)}</span>
                </div>
              </td>
              <td className="px-2 py-2 text-right">
                <button
                  type="button"
                  onClick={() => showFieldAsHuman(invoiceId, row.key)}
                  className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-muted hover:border-line-strong hover:text-ink"
                >
                  Show
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
