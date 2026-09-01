import type { InvoiceState, Issue, Store } from '@/lib/store';
import { VENDORS } from '@/lib/seed';
import { nextInvoiceId } from '@/lib/domain/next';
import { formatMoney } from '@/lib/domain/tax';
import { HEADER_FIELD_KEYS, LINE_FIELD_COLUMNS, type Bbox, type LineFieldColumn } from '@/lib/types';

export interface FieldEvidence {
  field: string;
  value: string;
  confidence: number;
  page: number;
  bbox: Bbox;
}

const LINE_KEY = /^line:(\d+):(description|qty|unit_price|amount)$/;

export function vendorName(invoice: Pick<InvoiceState, 'vendor_id' | 'vendor_name_on_doc'>): string {
  return VENDORS[invoice.vendor_id]?.name ?? invoice.vendor_name_on_doc;
}

export function openIssues(invoice: Pick<InvoiceState, 'issues'>): Issue[] {
  return invoice.issues.filter((i) => !i.resolved);
}

export function openInvoiceOf(state: Pick<Store, 'openInvoiceId' | 'invoices'>): InvoiceState | null {
  return state.openInvoiceId ? (state.invoices[state.openInvoiceId] ?? null) : null;
}

export function nextAfter(state: Pick<Store, 'order' | 'invoices'>, currentId: string | null): string | null {
  return nextInvoiceId(state.order, (id) => state.invoices[id]?.status, currentId);
}

export function validFieldKeys(invoice: Pick<InvoiceState, 'fields' | 'line_items'>): string[] {
  const headers = HEADER_FIELD_KEYS.filter((key) => key in invoice.fields);
  const n = invoice.line_items.length;
  const lineRange = n === 1 ? '1' : `1-${n}`;
  return n === 0 ? [...headers] : [...headers, `line:<${lineRange}>:<${LINE_FIELD_COLUMNS.join('|')}>`];
}

export function resolveField(invoice: Pick<InvoiceState, 'fields' | 'line_items'>, key: string): FieldEvidence | null {
  const header = (HEADER_FIELD_KEYS as readonly string[]).includes(key)
    ? invoice.fields[key as (typeof HEADER_FIELD_KEYS)[number]]
    : undefined;
  if (header) return { field: key, ...header };
  const match = LINE_KEY.exec(key);
  if (!match) return null;
  const item = invoice.line_items.find((l) => l.line === Number(match[1]));
  if (!item) return null;
  const column = match[2] as LineFieldColumn;
  return { field: key, value: lineValue(item, column), confidence: item.confidence, page: item.page, bbox: item.bbox[column] };
}

function lineValue(item: InvoiceState['line_items'][number], column: LineFieldColumn): string {
  switch (column) {
    case 'description':
      return item.description;
    case 'qty':
      return String(item.qty);
    case 'unit_price':
      return formatMoney(item.unit_price);
    case 'amount':
      return formatMoney(item.amount);
  }
}
