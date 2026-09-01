import { describe, expect, it } from 'vitest';
import { NO_PO_MESSAGE, threeWayMatch } from '@/lib/domain/match';
import { PURCHASE_ORDERS, RECEIPTS_BY_PO, SEED_INVOICES, VENDORS } from '@/lib/seed';
import type { InvoiceSeed } from '@/lib/types';

function seed(id: string): InvoiceSeed {
  const invoice = SEED_INVOICES.find((inv) => inv.id === id);
  if (!invoice) throw new Error(`missing seed ${id}`);
  return invoice;
}

function matchFor(id: string) {
  const invoice = seed(id);
  const po = invoice.po_number ? PURCHASE_ORDERS[invoice.po_number] : undefined;
  const receipt = invoice.po_number ? RECEIPTS_BY_PO[invoice.po_number] : undefined;
  return threeWayMatch(invoice, po, receipt, VENDORS[invoice.vendor_id]);
}

describe('threeWayMatch on seed invoices', () => {
  it('inv_001 matches on every line and total', () => {
    const result = matchFor('inv_001');
    expect(result.result).toBe('match');
    expect(result.lines.map((l) => l.verdict)).toEqual(['ok', 'ok', 'ok']);
    expect(result.mismatches).toEqual([]);
    expect(result.totals.total_ok).toBe(true);
  });

  it('inv_002 bills 120 against 100 received on line 1', () => {
    const result = matchFor('inv_002');
    expect(result.result).toBe('mismatch');
    expect(result.lines[0]).toMatchObject({ line: 1, qty_invoiced: 120, qty_ordered: 100, qty_received: 100, verdict: 'qty_over_received' });
    expect(result.lines.slice(1).every((l) => l.verdict === 'ok')).toBe(true);
    expect(result.mismatches).toEqual(['Line 1: invoiced 120, received 100']);
  });

  it('inv_003 prices line 1 4.13% over PO against a 3% tolerance', () => {
    const result = matchFor('inv_003');
    expect(result.price_tolerance_pct).toBe(3);
    expect(result.lines[0]).toMatchObject({ verdict: 'price_over_tolerance', price_variance_pct: 4.13, po_unit_price: 300, unit_price: 312.4 });
    expect(result.mismatches[0]).toContain('+4.13%');
  });

  it('inv_006 has no purchase order', () => {
    const result = matchFor('inv_006');
    expect(result.result).toBe('no_po');
    expect(result.po_number).toBeNull();
    expect(result.message).toBe(NO_PO_MESSAGE);
    expect(result.totals.total_ok).toBe(true);
  });

  it('inv_008 misprints tax by two cents', () => {
    const result = matchFor('inv_008');
    expect(result.result).toBe('mismatch');
    expect(result.totals).toMatchObject({ tax_expected: 187.98, tax_on_invoice: 188, tax_ok: false, total_expected: 2537.73, total_ok: false });
    expect(result.mismatches).toEqual(['Tax printed 188.00, expected 187.98', 'Total printed 2537.75, expected 2537.73']);
  });

  it.each(['inv_004a', 'inv_004b', 'inv_005', 'inv_007'])('%s matches (its problem is not a match problem)', (id) => {
    expect(matchFor(id).result).toBe('match');
  });
});

describe('threeWayMatch edge cases', () => {
  it('treats a missing PO record as no_po even when a PO number is printed', () => {
    const invoice = seed('inv_001');
    const result = threeWayMatch(invoice, undefined, undefined, VENDORS[invoice.vendor_id]);
    expect(result.result).toBe('no_po');
    expect(result.po_number).toBe('PO-44718');
  });

  it('reports null received quantities without a receipt and still checks the order', () => {
    const invoice = seed('inv_002');
    const result = threeWayMatch(invoice, PURCHASE_ORDERS['PO-44720'], undefined, VENDORS[invoice.vendor_id]);
    expect(result.receipt_id).toBeNull();
    expect(result.lines[0]).toMatchObject({ qty_received: null, verdict: 'qty_over_ordered' });
  });

  it('falls back to the same line index when descriptions do not overlap', () => {
    const invoice = seed('inv_001');
    const renamed = { ...invoice, line_items: invoice.line_items.map((l) => ({ ...l, description: 'Widget' })) };
    const result = threeWayMatch(renamed, PURCHASE_ORDERS['PO-44718'], RECEIPTS_BY_PO['PO-44718'], VENDORS[invoice.vendor_id]);
    expect(result.result).toBe('match');
  });

  it('marks a line the PO does not carry', () => {
    const invoice = seed('inv_001');
    const extra = { ...invoice.line_items[0], line: 4, description: 'Expedite fee', qty: 1, unit_price: 50, amount: 50 };
    const padded = { ...invoice, line_items: [...invoice.line_items, extra], subtotal: 12050, total: 13014 };
    const result = threeWayMatch(padded, PURCHASE_ORDERS['PO-44718'], RECEIPTS_BY_PO['PO-44718'], VENDORS[invoice.vendor_id]);
    expect(result.lines[3].verdict).toBe('line_not_on_po');
    expect(result.mismatches).toContain('Line 4: not on the purchase order');
  });

  it('treats a zero PO price as a price mismatch only when the invoice charges', () => {
    const invoice = seed('inv_007');
    const po = PURCHASE_ORDERS['PO-44725'];
    const freePo = { ...po, lines: po.lines.map((l, i) => (i === 0 ? { ...l, unit_price: 0 } : l)) };
    const result = threeWayMatch(invoice, freePo, RECEIPTS_BY_PO['PO-44725'], VENDORS[invoice.vendor_id]);
    expect(result.lines[0]).toMatchObject({ verdict: 'price_over_tolerance', price_variance_pct: null });
  });
});
