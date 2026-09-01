import type { InvoiceSeed, LineItem, PurchaseOrder, PurchaseOrderLine, Receipt, Vendor } from '@/lib/types';
import { jaccard, tokenize } from '@/lib/domain/normalize';
import { checkTax, formatMoney, moneyEquals, roundMoney } from '@/lib/domain/tax';

export type MatchOutcome = 'match' | 'mismatch' | 'no_po';
export type LineVerdict =
  | 'ok'
  | 'qty_over_received'
  | 'qty_over_ordered'
  | 'price_over_tolerance'
  | 'line_not_on_po';

export interface MatchLine {
  line: number;
  qty_invoiced: number;
  qty_ordered: number | null;
  qty_received: number | null;
  unit_price: number;
  po_unit_price: number | null;
  price_variance_pct: number | null;
  verdict: LineVerdict;
}

export interface MatchTotals {
  subtotal_ok: boolean;
  tax_expected: number;
  tax_on_invoice: number;
  tax_ok: boolean;
  total_expected: number;
  total_on_invoice: number;
  total_ok: boolean;
}

export interface MatchResult {
  result: MatchOutcome;
  po_number: string | null;
  receipt_id: string | null;
  price_tolerance_pct: number;
  lines: MatchLine[];
  totals: MatchTotals;
  mismatches: string[];
  message: string;
}

export const NO_PO_MESSAGE =
  'Invoice has no purchase order. Use propose_gl_coding to code the lines, then request_countersign.';
const MATCH_MESSAGE = 'Every line matches the purchase order and goods receipt, and the totals verify.';
const JACCARD_THRESHOLD = 0.5;
const PERCENT = 100;

type MatchInput = Pick<InvoiceSeed, 'po_number' | 'subtotal' | 'tax' | 'total' | 'line_items'>;

export function threeWayMatch(
  invoice: MatchInput,
  po: PurchaseOrder | undefined,
  receipt: Receipt | undefined,
  vendor: Vendor,
): MatchResult {
  const totals = checkTotals(invoice, vendor.tax_rate);
  if (!invoice.po_number || !po) {
    return {
      result: 'no_po',
      po_number: invoice.po_number ?? null,
      receipt_id: null,
      price_tolerance_pct: vendor.price_tolerance_pct,
      lines: invoice.line_items.map(unmatchedLine),
      totals,
      mismatches: totalMismatches(totals, invoice),
      message: NO_PO_MESSAGE,
    };
  }
  const receivedByLine = new Map((receipt?.lines ?? []).map((l) => [l.line, l.qty_received]));
  const lines = pairLines(invoice.line_items, po.lines).map(([item, poLine]) =>
    judgeLine(item, poLine, poLine ? (receivedByLine.get(poLine.line) ?? null) : null, vendor.price_tolerance_pct),
  );
  const mismatches = [...lines.flatMap(lineMismatch), ...totalMismatches(totals, invoice)];
  return {
    result: mismatches.length === 0 ? 'match' : 'mismatch',
    po_number: po.po_number,
    receipt_id: receipt?.receipt_id ?? null,
    price_tolerance_pct: vendor.price_tolerance_pct,
    lines,
    totals,
    mismatches,
    message: mismatches.length === 0 ? MATCH_MESSAGE : `${mismatches.length} mismatch${mismatches.length === 1 ? '' : 'es'} found.`,
  };
}

function pairLines(items: LineItem[], poLines: PurchaseOrderLine[]): [LineItem, PurchaseOrderLine | undefined][] {
  const unmatched = new Set(poLines);
  const pairs: [LineItem, PurchaseOrderLine | undefined][] = [];
  for (const item of items) {
    const best = bestTokenMatch(item, unmatched) ?? sameIndexIfFree(item, poLines, unmatched);
    if (best) unmatched.delete(best);
    pairs.push([item, best]);
  }
  return pairs;
}

function bestTokenMatch(item: LineItem, candidates: Set<PurchaseOrderLine>): PurchaseOrderLine | undefined {
  const itemTokens = tokenize(item.description);
  let best: PurchaseOrderLine | undefined;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = jaccard(itemTokens, tokenize(candidate.description));
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore >= JACCARD_THRESHOLD ? best : undefined;
}

function sameIndexIfFree(item: LineItem, poLines: PurchaseOrderLine[], unmatched: Set<PurchaseOrderLine>) {
  const candidate = poLines.find((l) => l.line === item.line);
  return candidate && unmatched.has(candidate) ? candidate : undefined;
}

function unmatchedLine(item: LineItem): MatchLine {
  return {
    line: item.line,
    qty_invoiced: item.qty,
    qty_ordered: null,
    qty_received: null,
    unit_price: item.unit_price,
    po_unit_price: null,
    price_variance_pct: null,
    verdict: 'line_not_on_po',
  };
}

function judgeLine(
  item: LineItem,
  poLine: PurchaseOrderLine | undefined,
  qtyReceived: number | null,
  tolerancePct: number,
): MatchLine {
  if (!poLine) return unmatchedLine(item);
  const variance = priceVariancePct(item.unit_price, poLine.unit_price);
  return {
    line: item.line,
    qty_invoiced: item.qty,
    qty_ordered: poLine.qty,
    qty_received: qtyReceived,
    unit_price: item.unit_price,
    po_unit_price: poLine.unit_price,
    price_variance_pct: variance,
    verdict: lineVerdict(item, poLine, qtyReceived, variance, tolerancePct),
  };
}

function priceVariancePct(unitPrice: number, poPrice: number): number | null {
  if (poPrice === 0) return null;
  return Math.round(((unitPrice - poPrice) / poPrice) * PERCENT * PERCENT) / PERCENT;
}

function lineVerdict(
  item: LineItem,
  poLine: PurchaseOrderLine,
  qtyReceived: number | null,
  variance: number | null,
  tolerancePct: number,
): LineVerdict {
  if (qtyReceived !== null && item.qty > qtyReceived) return 'qty_over_received';
  if (item.qty > poLine.qty) return 'qty_over_ordered';
  const priceOff = variance === null ? item.unit_price !== 0 : Math.abs(variance) > tolerancePct;
  return priceOff ? 'price_over_tolerance' : 'ok';
}

function lineMismatch(line: MatchLine): string[] {
  switch (line.verdict) {
    case 'ok':
      return [];
    case 'qty_over_received':
      return [`Line ${line.line}: invoiced ${line.qty_invoiced}, received ${line.qty_received}`];
    case 'qty_over_ordered':
      return [`Line ${line.line}: invoiced ${line.qty_invoiced}, ordered ${line.qty_ordered}`];
    case 'price_over_tolerance':
      return [priceMismatch(line)];
    case 'line_not_on_po':
      return [`Line ${line.line}: not on the purchase order`];
  }
}

function priceMismatch(line: MatchLine): string {
  const variance = line.price_variance_pct === null ? 'PO price is 0.00' : `${signed(line.price_variance_pct)}%`;
  return `Line ${line.line}: unit price ${formatMoney(line.unit_price)} vs PO ${formatMoney(line.po_unit_price ?? 0)} (${variance})`;
}

function signed(pct: number): string {
  return `${pct > 0 ? '+' : ''}${pct.toFixed(2)}`;
}

function checkTotals(invoice: MatchInput, taxRate: number): MatchTotals {
  const lineSum = roundMoney(invoice.line_items.reduce((sum, l) => sum + l.amount, 0));
  const tax = checkTax(invoice.subtotal, taxRate, invoice.tax);
  const total_expected = roundMoney(invoice.subtotal + tax.tax_expected);
  return {
    subtotal_ok: moneyEquals(lineSum, invoice.subtotal),
    ...tax,
    total_expected,
    total_on_invoice: invoice.total,
    total_ok: moneyEquals(total_expected, invoice.total),
  };
}

function totalMismatches(totals: MatchTotals, invoice: MatchInput): string[] {
  const out: string[] = [];
  if (!totals.subtotal_ok) {
    const lineSum = roundMoney(invoice.line_items.reduce((sum, l) => sum + l.amount, 0));
    out.push(`Subtotal printed ${formatMoney(invoice.subtotal)}, line amounts sum to ${formatMoney(lineSum)}`);
  }
  if (!totals.tax_ok) out.push(`Tax printed ${formatMoney(totals.tax_on_invoice)}, expected ${formatMoney(totals.tax_expected)}`);
  if (!totals.total_ok) out.push(`Total printed ${formatMoney(totals.total_on_invoice)}, expected ${formatMoney(totals.total_expected)}`);
  return out;
}
