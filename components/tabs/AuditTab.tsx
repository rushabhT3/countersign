'use client';

import { useState } from 'react';
import { useStore, type AuditEntry } from '@/lib/store';
import { clockTime } from '@/lib/ui/format';
import { exportAuditAsHuman } from '@/lib/ui/manual';

export interface AuditTabProps {
  invoiceId: string | null;
}

const ACTOR_CLASSES: Record<AuditEntry['actor'], string> = {
  agent: 'bg-blue-200 text-blue-950',
  human: 'bg-green-200 text-green-950',
  system: 'bg-slate-200 text-slate-900',
};

function AuditRow({ entry }: { entry: AuditEntry }) {
  return (
    <li className={`px-3 py-2 font-mono text-[11px] leading-4 ${entry.ok ? '' : 'bg-red-50'}`}>
      <div className="flex items-center gap-2">
        <span className="text-ink-faint">{clockTime(entry.ts)}</span>
        <span className={`rounded-sm px-1 font-semibold uppercase ${ACTOR_CLASSES[entry.actor]}`}>{entry.actor}</span>
        <span className="font-medium">{entry.name}</span>
        {entry.invoice_id && <span className="text-ink-muted">{entry.invoice_id}</span>}
        {entry.duration_ms !== undefined && <span className="ml-auto text-ink-faint">{entry.duration_ms} ms</span>}
        {!entry.ok && <span className="ml-auto text-red-800">error</span>}
      </div>
      {entry.args_summary !== '{}' && entry.args_summary !== '' && <div className="mt-0.5 truncate text-ink-muted">→ {entry.args_summary}</div>}
      <div className="mt-0.5 line-clamp-2 break-all text-ink">← {entry.result_summary}</div>
    </li>
  );
}

export function AuditTab({ invoiceId }: AuditTabProps) {
  const audit = useStore((s) => s.audit);
  const [isScoped, setIsScoped] = useState(false);
  const entries = [...audit].reverse().filter((e) => !isScoped || !invoiceId || e.invoice_id === invoiceId);

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-line bg-panel-muted px-3 py-2 text-xs">
        <span className="text-ink-muted">
          {entries.length} of {audit.length} entries
        </span>
        {invoiceId && (
          <label className="flex items-center gap-1.5 text-ink-muted">
            <input type="checkbox" checked={isScoped} onChange={(e) => setIsScoped(e.target.checked)} className="accent-amber-600" />
            This invoice only
          </label>
        )}
        <button
          type="button"
          onClick={exportAuditAsHuman}
          className="ml-auto rounded-md border border-line bg-panel px-2 py-1 text-[11px] font-medium hover:border-line-strong"
        >
          Export JSON
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="px-3 py-6 text-xs text-ink-muted">Nothing logged yet. Every tool call and every click lands here.</p>
      ) : (
        <ul className="divide-y divide-line">
          {entries.map((entry) => (
            <AuditRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}
