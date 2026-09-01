import type { LineVerdict } from '@/lib/domain/match';

const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function money(amount: number, currency = 'USD'): string {
  let formatter = currencyFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency });
    currencyFormatters.set(currency, formatter);
  }
  return formatter.format(amount);
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false });
}

export function dateTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function humanize(key: string): string {
  return key.replace(/_/g, ' ');
}

export function statusLabel(status: string): string {
  return status === 'needs_review' ? 'to review' : status;
}

const VERDICT_LABELS: Record<LineVerdict, string> = {
  ok: 'ok',
  qty_over_received: 'qty > received',
  qty_over_ordered: 'qty > ordered',
  price_over_tolerance: 'price > tolerance',
  line_not_on_po: 'not on PO',
};

export function verdictLabel(verdict: LineVerdict): string {
  return VERDICT_LABELS[verdict];
}
