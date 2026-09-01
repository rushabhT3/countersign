import type { Status } from '@/lib/types';
import { moneyEquals } from '@/lib/domain/tax';

export type DuplicateReason = 'same_total' | 'within_14_days' | 'same_number_normalized' | 'same_po';

export interface DuplicateSubject {
  id: string;
  vendor_id: string;
  invoice_number: string;
  issue_date: string;
  total: number;
  po_number?: string;
  status: Status;
}

export interface DuplicateCandidate {
  id: string;
  invoice_number: string;
  issue_date: string;
  total: number;
  status: Status;
  reasons: DuplicateReason[];
}

const DATE_WINDOW_DAYS = 14;
const MS_PER_DAY = 86_400_000;

export function normalizeInvoiceNumber(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^[a-z]+/, '')
    .replace(/^0+/, '');
}

export function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / MS_PER_DAY;
}

export function findDuplicates(target: DuplicateSubject, all: DuplicateSubject[]): DuplicateCandidate[] {
  return all
    .filter((other) => other.id !== target.id && other.vendor_id === target.vendor_id)
    .map((other) => ({ other, reasons: reasonsFor(target, other) }))
    .filter(({ reasons }) => isLikelyDuplicate(reasons))
    .map(({ other, reasons }) => ({
      id: other.id,
      invoice_number: other.invoice_number,
      issue_date: other.issue_date,
      total: other.total,
      status: other.status,
      reasons,
    }));
}

function reasonsFor(target: DuplicateSubject, other: DuplicateSubject): DuplicateReason[] {
  const reasons: DuplicateReason[] = [];
  if (moneyEquals(target.total, other.total)) reasons.push('same_total');
  if (daysBetween(target.issue_date, other.issue_date) <= DATE_WINDOW_DAYS) reasons.push('within_14_days');
  const normalized = normalizeInvoiceNumber(target.invoice_number);
  if (normalized !== '' && normalized === normalizeInvoiceNumber(other.invoice_number)) reasons.push('same_number_normalized');
  if (target.po_number && target.po_number === other.po_number) reasons.push('same_po');
  return reasons;
}

function isLikelyDuplicate(reasons: DuplicateReason[]): boolean {
  const has = (r: DuplicateReason) => reasons.includes(r);
  return (has('same_total') && has('within_14_days')) || has('same_number_normalized');
}
