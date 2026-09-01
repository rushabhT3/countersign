'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { isWebMCPAvailable, registerTools, type AnyToolDef } from '@/lib/webmcp/registry';
import { QUEUE_TOOLS } from '@/lib/webmcp/tools/queue';
import { INVOICE_TOOLS } from '@/lib/webmcp/tools/invoice';

function useRegistration(tools: AnyToolDef[], active: boolean) {
  const setToolsRegistered = useStore((s) => s.setToolsRegistered);
  useEffect(() => {
    if (!active || !isWebMCPAvailable()) return;
    const controller = new AbortController();
    registerTools(tools, controller.signal).then((names) => {
      if (!controller.signal.aborted) setToolsRegistered(names, true);
    });
    return () => {
      controller.abort();
      setToolsRegistered(
        tools.map((t) => t.name),
        false,
      );
    };
  }, [tools, active, setToolsRegistered]);
}

// Queue tools live for the page lifetime. Invoice tools register once when an invoice opens and
// unregister only when the workbench returns to the empty state, so switching invoices is free.
export function WebMCPProvider() {
  const isOpen = useStore((s) => s.openInvoiceId !== null);
  const setWebmcpAvailable = useStore((s) => s.setWebmcpAvailable);

  useEffect(() => {
    setWebmcpAvailable(isWebMCPAvailable());
  }, [setWebmcpAvailable]);

  useRegistration(QUEUE_TOOLS, true);
  useRegistration(INVOICE_TOOLS, isOpen);

  return null;
}
