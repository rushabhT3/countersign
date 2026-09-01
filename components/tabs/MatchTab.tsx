'use client';

import { useStore } from '@/lib/store';
import type { MatchResult, MatchTotals } from '@/lib/domain/match';
import type { DuplicateCandidate } from '@/lib/domain/duplicates';
import { Chip } from '@/components/Chip';
import { outcomeTone, statusTone, verdictTone } from '@/lib/ui/tones';
import { humanize, money, statusLabel } from '@/lib/ui/format';
import { findDuplicatesAsHuman, runMatchAsHuman } from '@/lib/ui/manual';

export interface MatchTabProps {
  invoiceId: string;
}

const SECTION = 'px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted';
const ACTION = 'rounded-md border border-line bg-panel px-2.5 py-1 text-xs font-medium text-ink hover:border-line-strong';

function variance(pct: number | null): string {
  if (pct === null) return '—';
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
}

function TotalsBlock({ totals, currency }: { totals: MatchTotals; currency: string }) {
  const rows = [
    { label: 'Subtotal', ok: totals.subtotal_ok, printed: null, expected: null },
    { label: 'Tax', ok: totals.tax_ok, printed: totals.tax_on_invoice, expected: totals.tax_expected },
    { label: 'Total', ok: totals.total_ok, printed: totals.total_on_invoice, expected: totals.total_expected },
  ];
  return (
    <table className="w-full text-xs">
      <tbody className="divide-y divide-line">
        {rows.map((row) => (
          <tr key={row.label}>
            <td className="px-3 py-1.5 text-ink-muted">{row.label}</td>
            <td className="px-3 py-1.5 text-right tabular-nums">{row.printed === null ? 'lines sum' : money(row.printed, currency)}</td>
            <td className="px-3 py-1.5 text-right tabular-nums text-ink-muted">{row.expected === null ? '' : `expected ${money(row.expected, currency)}`}</td>
            <td className="px-3 py-1.5 text-right">
              <Chip tone={row.ok ? 'green' : 'red'}>{row.ok ? 'ok' : 'off'}</Chip>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MatchDetails({ result, currency }: { result: MatchResult; currency: string }) {
  return (
    <>
      <div className="flex items-start gap-3 border-b border-line px-3 py-3">
        <Chip tone={outcomeTone(result.result)} className="mt-0.5 text-xs">
          {humanize(result.result)}
        </Chip>
        <div className="text-xs">
          <p>{result.message}</p>
          <p className="mt-1 text-ink-muted">
            {result.po_number ? `PO ${result.po_number}` : 'No PO'} · {result.receipt_id ? `receipt ${result.receipt_id}` : 'no receipt'} · tolerance{' '}
            {result.price_tolerance_pct}%
          </p>
        </div>
      </div>
      {result.lines.length > 0 && (
        <table className="w-full text-xs">
          <thead className="bg-panel-muted text-left text-[11px] uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-2 py-1.5 font-medium">#</th>
              <th className="px-2 py-1.5 text-right font-medium">Inv</th>
              <th className="px-2 py-1.5 text-right font-medium">Ord</th>
              <th className="px-2 py-1.5 text-right font-medium">Rcvd</th>
              <th className="px-2 py-1.5 text-right font-medium whitespace-nowrap">Price/PO</th>
              <th className="px-2 py-1.5 text-right font-medium">Var</th>
              <th className="px-2 py-1.5 font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {result.lines.map((line) => (
              <tr key={line.line}>
                <td className="px-2 py-1.5 text-ink-muted">{line.line}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{line.qty_invoiced}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{line.qty_ordered ?? '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{line.qty_received ?? '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">
                  {money(line.unit_price, currency)}
                  <span className="text-ink-faint"> / {line.po_unit_price === null ? '—' : money(line.po_unit_price, currency)}</span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{variance(line.price_variance_pct)}</td>
                <td className="px-2 py-1.5">
                  <Chip tone={verdictTone(line.verdict)}>{humanize(line.verdict)}</Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3 className={`${SECTION} border-t border-line`}>Totals</h3>
      <TotalsBlock totals={result.totals} currency={currency} />
      {result.mismatches.length > 0 && (
        <>
          <h3 className={`${SECTION} border-t border-line`}>Mismatches</h3>
          <ul className="space-y-1 px-3 pb-3 text-xs">
            {result.mismatches.map((m) => (
              <li key={m} className="flex gap-2">
                <span className="text-red-700" aria-hidden="true">
                  ✕
                </span>
                {m}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function DuplicateList({ candidates, currency }: { candidates: DuplicateCandidate[]; currency: string }) {
  if (candidates.length === 0) return <p className="px-3 pb-3 text-xs text-ink-muted">No likely duplicates found.</p>;
  return (
    <ul className="divide-y divide-line text-xs">
      {candidates.map((c) => (
        <li key={c.id} className="flex flex-col gap-1 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono font-medium">{c.invoice_number}</span>
            <span className="tabular-nums">{money(c.total, currency)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip tone={statusTone(c.status)}>{statusLabel(c.status)}</Chip>
            <span className="text-ink-muted">{c.issue_date}</span>
            {c.reasons.map((r) => (
              <Chip key={r} tone="red">
                {humanize(r)}
              </Chip>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MatchTab({ invoiceId }: MatchTabProps) {
  const invoice = useStore((s) => s.invoices[invoiceId]);
  return (
    <div>
      {invoice.match_result ? (
        <MatchDetails result={invoice.match_result} currency={invoice.currency} />
      ) : (
        <div className="flex flex-col items-start gap-3 px-3 py-6 text-xs text-ink-muted">
          <p>Ask the agent to run a three-way match, or run it manually.</p>
          <button type="button" className={ACTION} onClick={() => runMatchAsHuman(invoiceId)}>
            Run three-way match
          </button>
        </div>
      )}
      <h3 className={`${SECTION} border-t border-line`}>Duplicate check</h3>
      {invoice.duplicate_check ? (
        <DuplicateList candidates={invoice.duplicate_check.candidates} currency={invoice.currency} />
      ) : (
        <div className="flex flex-col items-start gap-3 px-3 pb-4 text-xs text-ink-muted">
          <p>Search the other invoices for the same vendor, total, dates, or normalized number.</p>
          <button type="button" className={ACTION} onClick={() => findDuplicatesAsHuman(invoiceId)}>
            Find duplicates
          </button>
        </div>
      )}
    </div>
  );
}
