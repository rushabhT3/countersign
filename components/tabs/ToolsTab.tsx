'use client';

import { useMemo } from 'react';
import { useStore, type AuditEntry } from '@/lib/store';
import { QUEUE_TOOLS } from '@/lib/webmcp/tools/queue';
import { INVOICE_TOOLS } from '@/lib/webmcp/tools/invoice';
import { LIMITS, type AnyToolDef } from '@/lib/webmcp/registry';
import { exampleInput, type ExampleState } from '@/lib/webmcp/examples';
import { Chip } from '@/components/Chip';
import { CopyButton } from '@/components/CopyButton';
import { clockTime } from '@/lib/ui/format';

interface ToolStats {
  calls: number;
  errors: number;
  last?: AuditEntry;
}

const EXAMPLE_HINTS: Record<string, string> = {
  get_decision: 'Call request_countersign first; the decision id fills in here.',
  flag_issue: 'Run the match, duplicate search, or vendor check first; the example fills from the finding.',
};
const NO_INVOICE_HINT = 'Open an invoice first.';

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

function useExampleState(): ExampleState {
  const openInvoiceId = useStore((s) => s.openInvoiceId);
  const invoices = useStore((s) => s.invoices);
  const order = useStore((s) => s.order);
  const decisions = useStore((s) => s.decisions);
  return useMemo(() => ({ openInvoiceId, invoices, order, decisions }), [openInvoiceId, invoices, order, decisions]);
}

function ExampleLine({ tool, exampleState }: { tool: AnyToolDef; exampleState: ExampleState }) {
  const example = exampleInput(tool.name, exampleState);
  if (!example) {
    const hint = exampleState.openInvoiceId || tool.name === 'get_decision' ? EXAMPLE_HINTS[tool.name] : NO_INVOICE_HINT;
    return <p className="text-[10px] text-ink-faint">Example input: {hint ?? NO_INVOICE_HINT}</p>;
  }
  const json = JSON.stringify(example);
  return (
    <div className="flex items-center gap-1.5">
      <code className="min-w-0 flex-1 truncate rounded-sm bg-panel-muted px-1.5 py-0.5 font-mono text-[10px] text-ink" title={json}>
        {json}
      </code>
      <CopyButton text={json} label={`Copy example input for ${tool.name}`} />
    </div>
  );
}

function LastCall({ entry }: { entry: AuditEntry }) {
  const hasArgs = entry.args_summary !== '{}' && entry.args_summary !== '';
  return (
    <div className="font-mono text-[10px] text-ink-faint">
      <p className="truncate">
        {clockTime(entry.ts)} · {entry.ok ? 'ok' : 'error'}
        {hasArgs && <span className="text-ink-muted"> · in {entry.args_summary}</span>}
      </p>
      <p className="truncate">out {entry.result_summary}</p>
    </div>
  );
}

interface ToolRowProps {
  tool: AnyToolDef;
  step?: number;
  isRegistered: boolean;
  stats?: ToolStats;
  exampleState: ExampleState;
}

function ToolRow({ tool, step, isRegistered, stats, exampleState }: ToolRowProps) {
  const isRead = tool.annotations?.readOnlyHint === true;
  return (
    <li className="flex flex-col gap-1 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {step !== undefined && <span className="font-mono text-[10px] text-ink-faint">{step}</span>}
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
      <ExampleLine tool={tool} exampleState={exampleState} />
      {stats?.last && <LastCall entry={stats.last} />}
    </li>
  );
}

interface ToolGroupProps {
  title: string;
  note: string;
  tools: AnyToolDef[];
  isNumbered?: boolean;
  registered: Set<string>;
  stats: Record<string, ToolStats>;
  exampleState: ExampleState;
}

function ToolGroup({ title, note, tools, isNumbered = false, registered, stats, exampleState }: ToolGroupProps) {
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
        {tools.map((tool, index) => (
          <ToolRow
            key={tool.name}
            tool={tool}
            step={isNumbered ? index + 1 : undefined}
            isRegistered={registered.has(tool.name)}
            stats={stats[tool.name]}
            exampleState={exampleState}
          />
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
  const exampleState = useExampleState();

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
        <p className="mt-1.5 text-ink-muted">
          Each row carries an example input built from the invoice on screen. Copy it into Chrome&apos;s Model Context Tool Inspector to call the tool by hand.
        </p>
      </div>
      <ToolGroup title="Always registered" note="Queue tools live for the life of the page." tools={QUEUE_TOOLS} registered={registered} stats={stats} exampleState={exampleState} />
      <ToolGroup
        title="While an invoice is open"
        note="Registered once when an invoice opens, unregistered when the workbench returns to empty. Numbered in the order a review runs."
        tools={INVOICE_TOOLS}
        isNumbered
        registered={registered}
        stats={stats}
        exampleState={exampleState}
      />
    </div>
  );
}
