import type { Status } from '@/lib/types';

const PENDING: Status[] = ['needs_review', 'flagged'];

export function isPending(status: Status): boolean {
  return PENDING.includes(status);
}

export function nextInvoiceId(
  order: string[],
  statusOf: (id: string) => Status | undefined,
  currentId: string | null,
): string | null {
  if (order.length === 0) return null;
  const start = currentId ? order.indexOf(currentId) : -1;
  for (let step = 1; step <= order.length; step += 1) {
    const candidate = order[(start + step) % order.length];
    if (candidate === currentId) continue;
    const status = statusOf(candidate);
    if (status && isPending(status)) return candidate;
  }
  return null;
}
