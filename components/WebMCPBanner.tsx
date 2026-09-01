'use client';

import { useStore } from '@/lib/store';

export function WebMCPBanner() {
  const available = useStore((s) => s.webmcpAvailable);
  if (available !== false) return null;
  return (
    <div role="status" className="shrink-0 border-b border-amber-300 bg-amber-100 px-4 py-2 text-xs text-amber-950">
      This page exposes WebMCP tools. Open it in the ChatGPT desktop app&apos;s built-in browser, or in Chrome 149+ with{' '}
      <code className="rounded bg-amber-200 px-1 font-mono">chrome://flags/#enable-webmcp-testing</code> enabled, and ask the agent to work
      through the queue. Everything below also works by hand.
    </div>
  );
}
