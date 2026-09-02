'use client';

import { useMemo } from 'react';
import { useStore, type AuditEntry } from '@/lib/store';
import { QUEUE_TOOLS } from '@/lib/webmcp/tools/queue';
import { INVOICE_TOOLS } from '@/lib/webmcp/tools/invoice';
import { LIMITS, type AnyToolDef } from '@/lib/webmcp/registry';
import { Chip } from '@/components/Chip';
import { clockTime } from '@/lib/ui/format';

interface ToolStats {
  calls: number;
  errors: number;
  last?: AuditEntry;
}

function useToolStats(): Record<string, ToolStats> {
  const audit = useStore((s) => s.audit);
  return useMemo(() => {
    const stats: Record<string, ToolStats> = {};
    for (const entry of audit) {
      if (entry.kind !== 'tool_call') continue;
      const current = stats[entry.name] ?? { calls: 0, errors: 0 };
      current.calls += 1;
      if (!entry.ok) current.errors += 1;
      current.last = entry;
      stats[entry.name] = current;
    }
    return stats;
  }, [audit]);
}

function ToolRow({ tool, isRegistered, stats }: { tool: AnyToolDef; isRegistered: boolean; stats?: ToolStats }) {
  const isRead = tool.annotations?.readOnlyHint === true;
  return (
    <li className="flex flex-col gap-1 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[12px] font-medium">{tool.name}</span>
        <Chip tone={isRegistered ? 'green' : 'slate'} title={isRegistered ? 'Registered with the agent right now' : 'Registered only while an invoice is open'}>
          {isRegistered ? 'live' : 'idle'}
        </Chip>
        <Chip tone={isRead ? 'blue' : 'amber'}>{isRead ? 'read' : 'write'}</Chip>
        {tool.annotations?.untrustedContentHint && <Chip tone="slate">untrusted</Chip>}
        <span className="ml-auto font-mono text-[11px] text-ink-muted">
          {stats ? `${stats.calls} call${stats.calls === 1 ? '' : 's'}` : 'no calls yet'}
          {stats?.errors ? <span className="text-red-800"> · {stats.errors} err</span> : null}
        </span>
      </div>
      <p className="line-clamp-2 text-[11px] leading-4 text-ink-muted">{tool.description}</p>
      {stats?.last && (
        <p className="truncate font-mono text-[10px] text-ink-faint">
          {clockTime(stats.last.ts)} · {stats.last.ok ? 'ok' : 'error'} · {stats.last.result_summary}
        </p>
      )}
    </li>
  );
}

function ToolGroup({ title, note, tools, registered, stats }: { title: string; note: string; tools: AnyToolDef[]; registered: Set<string>; stats: Record<string, ToolStats> }) {
  const live = tools.filter((t) => registered.has(t.name)).length;
  return (
    <section>
      <div className="flex items-baseline justify-between border-y border-line bg-panel-muted px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{title}</h3>
        <span className="font-mono text-[11px] text-ink-muted">
          {live}/{tools.length} live
        </span>
      </div>
      <p className="px-3 pt-2 text-[11px] text-ink-muted">{note}</p>
      <ul className="divide-y divide-line">
        {tools.map((tool) => (
          <ToolRow key={tool.name} tool={tool} isRegistered={registered.has(tool.name)} stats={stats[tool.name]} />
        ))}
      </ul>
    </section>
  );
}

export function ToolsTab() {
  const available = useStore((s) => s.webmcpAvailable);
  const registeredList = useStore((s) => s.registeredTools);
  const registered = useMemo(() => new Set(registeredList), [registeredList]);
  const stats = useToolStats();

  return (
    <div className="pb-4">
      <div className="px-3 py-3 text-xs">
        {available ? (
          <p>
            Registered through <code className="font-mono">document.modelContext.registerTool</code>. Budgets enforced in code: names ≤ {LIMITS.name}, descriptions ≤{' '}
            {LIMITS.description}, outputs ≤ {LIMITS.output.toLocaleString('en-US')} characters. Every call lands in the Audit tab.
          </p>
        ) : (
          <p>
            This browser has no WebMCP, so nothing is registered. In the ChatGPT desktop browser, or Chrome 149+ with the WebMCP flag, the header pill turns green and these rows go
            live: four on load, thirteen while an invoice is open.
          </p>
        )}
      </div>
      <ToolGroup title="Always registered" note="Queue tools live for the life of the page." tools={QUEUE_TOOLS} registered={registered} stats={stats} />
      <ToolGroup
        title="While an invoice is open"
        note="Registered once when an invoice opens, unregistered when the workbench returns to empty. Switching invoices keeps them."
        tools={INVOICE_TOOLS}
        registered={registered}
        stats={stats}
      />
    </div>
  );
}
