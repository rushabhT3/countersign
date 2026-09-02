'use client';

import { useEffect, useState } from 'react';
import { useStore, type AuditEntry } from '@/lib/store';

const TOAST_MS = 5000;
const MAX_VISIBLE = 4;
const ARGS_MAX = 44;

const ACTOR_CLASSES: Record<'agent' | 'human', string> = {
  agent: 'bg-blue-200 text-blue-950',
  human: 'bg-green-200 text-green-950',
};

function shortArgs(summary: string): string {
  const stripped = summary.replace(/^\{|\}$/g, '').replace(/"/g, '');
  if (stripped === '') return '';
  return stripped.length > ARGS_MAX ? `${stripped.slice(0, ARGS_MAX - 1)}…` : stripped;
}

function Toast({ entry }: { entry: AuditEntry }) {
  if (entry.actor === 'system') return null;
  const args = shortArgs(entry.args_summary);
  return (
    <div
      className={`motion-safe:animate-toast-in rounded-md border bg-panel px-2.5 py-1.5 font-mono text-[11px] leading-4 shadow-md ${
        entry.ok ? 'border-line' : 'border-red-400'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`rounded-sm px-1 text-[10px] font-semibold uppercase ${ACTOR_CLASSES[entry.actor]}`}>
          {entry.actor === 'agent' ? 'agent' : 'you'}
        </span>
        <span className="truncate font-medium">{entry.name}</span>
        {entry.duration_ms !== undefined && <span className="ml-auto shrink-0 text-ink-faint">{entry.duration_ms} ms</span>}
        {!entry.ok && <span className="ml-auto shrink-0 text-red-800">error</span>}
      </div>
      {args && <div className="truncate text-ink-muted">{args}</div>}
    </div>
  );
}

// Every audit entry becomes a short-lived toast over the page, so the agent's work is visible
// where the reviewer is looking instead of only in the Audit tab.
export function AgentActivity() {
  const [visible, setVisible] = useState<AuditEntry[]>([]);

  useEffect(() => {
    let lastSeenId = useStore.getState().audit.at(-1)?.id ?? null;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const unsubscribe = useStore.subscribe((state) => {
      const entries = state.audit;
      const lastIndex = lastSeenId ? entries.findIndex((e) => e.id === lastSeenId) : -1;
      const fresh = entries.slice(lastIndex + 1).filter((e) => e.actor !== 'system');
      lastSeenId = entries.at(-1)?.id ?? lastSeenId;
      if (fresh.length === 0) return;
      setVisible((current) => [...current, ...fresh].slice(-MAX_VISIBLE));
      for (const entry of fresh) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          setVisible((current) => current.filter((e) => e.id !== entry.id));
        }, TOAST_MS);
        timers.add(timer);
      }
    });
    return () => {
      unsubscribe();
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  if (visible.length === 0) return null;
  return (
    <div className="pointer-events-none absolute top-14 right-3 z-20 flex w-72 max-w-[calc(100%-1.5rem)] flex-col gap-1.5" aria-live="polite">
      {visible.map((entry) => (
        <Toast key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
