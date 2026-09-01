import { describe, expect, it } from 'vitest';
import { daysBetween, findDuplicates, normalizeInvoiceNumber, type DuplicateSubject } from '@/lib/domain/duplicates';
import { SEED_INVOICES } from '@/lib/seed';

const subjects: DuplicateSubject[] = SEED_INVOICES.map((inv) => ({
  id: inv.id,
  vendor_id: inv.vendor_id,
  invoice_number: inv.invoice_number,
  issue_date: inv.issue_date,
  total: inv.total,
  po_number: inv.po_number,
  status: inv.initial_status,
}));

function subject(id: string): DuplicateSubject {
  const found = subjects.find((s) => s.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe('normalizeInvoiceNumber', () => {
  it('strips prefixes, punctuation, and leading zeros', () => {
    expect(normalizeInvoiceNumber('INV-2291')).toBe('2291');
    expect(normalizeInvoiceNumber('2291')).toBe('2291');
    expect(normalizeInvoiceNumber('NP-88120')).toBe('88120');
    expect(normalizeInvoiceNumber('inv 000 42')).toBe('42');
    expect(normalizeInvoiceNumber('LF-2026-0917')).toBe('20260917');
  });
});

describe('findDuplicates', () => {
  it('inv_004b finds the already-approved INV-2291 with every reason', () => {
    const candidates = findDuplicates(subject('inv_004b'), subjects);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ id: 'inv_004a', invoice_number: 'INV-2291', status: 'approved', total: 8100 });
    expect(candidates[0].reasons).toEqual(['same_total', 'within_14_days', 'same_number_normalized', 'same_po']);
  });

  it('is symmetric', () => {
    expect(findDuplicates(subject('inv_004a'), subjects).map((c) => c.id)).toEqual(['inv_004b']);
  });

  it('inv_001 has no duplicates', () => {
    expect(findDuplicates(subject('inv_001'), subjects)).toEqual([]);
  });

  it('never returns the target itself or another vendor', () => {
    const twin = { ...subject('inv_001'), id: 'inv_x', vendor_id: 'ven_other' };
    expect(findDuplicates(subject('inv_001'), [...subjects, twin])).toEqual([]);
  });

  it('requires both same total and a 14-day window when numbers differ', () => {
    const base = subject('inv_001');
    const sameTotalLater = { ...base, id: 'later', invoice_number: 'INV-99999', issue_date: '2026-08-20' };
    expect(findDuplicates(base, [base, sameTotalLater]).map((c) => c.reasons)).toEqual([['same_total', 'within_14_days', 'same_po']]);
    const sameTotalTooLate = { ...sameTotalLater, issue_date: '2026-09-15' };
    expect(findDuplicates(base, [base, sameTotalTooLate])).toEqual([]);
  });
});

describe('daysBetween', () => {
  it('is absolute and calendar-based', () => {
    expect(daysBetween('2026-08-03', '2026-08-06')).toBe(3);
    expect(daysBetween('2026-08-06', '2026-08-03')).toBe(3);
  });
});
