'use client';

import { useShallow } from 'zustand/react/shallow';
import { useStore } from '@/lib/store';
import { STATUSES, type Status } from '@/lib/types';
import { money, statusLabel } from '@/lib/ui/format';

const RESET_PROMPT = 'Reset the demo? This clears every decision, issue, comment, and audit entry and reloads the nine seed invoices.';

interface QueueSummary extends Record<Status, number> {
  pendingTotal: number;
  heldTotal: number;
}

// useShallow keeps the derived object referentially stable so useSyncExternalStore settles;
// every value stays a primitive for the same reason.
function useQueueSummary(): QueueSummary {
  return useStore(
    useShallow((s) => {
      const summary = { ...(Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<Status, number>), pendingTotal: 0, heldTotal: 0 };
      for (const id of s.order) {
        const invoice = s.invoices[id];
        summary[invoice.status] += 1;
        if (invoice.status === 'needs_review' || invoice.status === 'flagged') summary.pendingTotal += invoice.total;
        if (invoice.status === 'held') summary.heldTotal += invoice.total;
      }
      return summary;
    }),
  );
}

function wholeDollars(amount: number): string {
  return money(Math.round(amount)).replace(/\.00$/, '');
}

function WebMCPPill() {
  const available = useStore((s) => s.webmcpAvailable);
  const registered = useStore((s) => s.registeredTools.length);
  if (available === null) return <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-800">Checking site tools…</span>;
  if (!available) return <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-800">WebMCP not detected</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-200 px-2.5 py-1 text-xs font-medium text-green-950">
      <span className="h-1.5 w-1.5 rounded-full bg-green-700" aria-hidden="true" />
      Site tools active · {registered} registered
    </span>
  );
}

export function Header() {
  const queue = useQueueSummary();
  const hydrated = useStore((s) => s.hydrated);
  const reset = useStore((s) => s.reset);
  const parts = STATUSES.filter((status) => queue[status] > 0).map((status) => `${queue[status]} ${statusLabel(status)}`);
  if (queue.pendingTotal > 0) parts.push(`${wholeDollars(queue.pendingTotal)} pending`);
  if (queue.heldTotal > 0) parts.push(`${wholeDollars(queue.heldTotal)} held`);
  const summary = parts.join(' · ');

  const handleResetClick = () => {
    if (window.confirm(RESET_PROMPT)) reset();
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-panel px-4">
      <div className="flex items-baseline gap-2">
        <span className="text-base font-semibold tracking-tight">Countersign</span>
        <span className="hidden text-xs text-ink-muted sm:inline">agent-native invoice review</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {hydrated && <span className="hidden rounded-full bg-panel-muted sm:inline px-2.5 py-1 text-xs text-ink-muted ring-1 ring-line">{summary}</span>}
        <WebMCPPill />
        <button
          type="button"
          onClick={handleResetClick}
          className="rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-muted hover:border-line-strong hover:text-ink"
        >
          Reset demo
        </button>
      </div>
    </header>
  );
}
