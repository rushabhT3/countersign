'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore, type InvoiceState } from '@/lib/store';
import type { Bbox } from '@/lib/types';
import { closeInvoiceAsHuman } from '@/lib/ui/manual';
import { vendorName } from '@/lib/webmcp/tools/common';
import { escapeText } from '@/lib/domain/normalize';

const PULSE_MS = 1800;

const SAMPLE_PROMPTS = [
  'Work through my review queue. Ask me to countersign each one.',
  'Work through invoice NP-88120.',
  'Check invoice 2291 from Apex before I pay it.',
];

function boxStyle([x0, y0, x1, y1]: Bbox): CSSProperties {
  return { left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${(x1 - x0) * 100}%`, height: `${(y1 - y0) * 100}%` };
}

function allBoxes(invoice: InvoiceState): { key: string; bbox: Bbox }[] {
  const headers = Object.entries(invoice.fields).map(([key, field]) => ({ key, bbox: field.bbox }));
  const lines = invoice.line_items.flatMap((item) =>
    Object.entries(item.bbox).map(([column, bbox]) => ({ key: `line:${item.line}:${column}`, bbox })),
  );
  return [...headers, ...lines];
}

function EmptyViewer() {
  return (
    <section className="flex min-h-[40vh] flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div>
        <p className="text-base font-medium">Pick an invoice, or ask the agent to work through the queue.</p>
        <p className="mt-1 text-sm text-ink-muted">Nine invoice tools register the moment one opens.</p>
      </div>
      <ul className="w-full max-w-md space-y-2 text-left">
        {SAMPLE_PROMPTS.map((prompt) => (
          <li key={prompt} className="rounded-md border border-line bg-panel px-3 py-2 font-mono text-xs text-ink-muted">
            {prompt}
          </li>
        ))}
      </ul>
    </section>
  );
}

function useHighlightPulse(nonce: number | undefined) {
  const [endedNonce, setEndedNonce] = useState<number | undefined>(undefined);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (nonce === undefined) return;
    boxRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const timer = setTimeout(() => setEndedNonce(nonce), PULSE_MS);
    return () => clearTimeout(timer);
  }, [nonce]);
  return { isPulsing: nonce !== undefined && endedNonce !== nonce, boxRef };
}

export function PageViewer() {
  const invoice = useStore((s) => (s.openInvoiceId ? s.invoices[s.openInvoiceId] : null));
  const highlight = useStore((s) => s.highlight);
  const [showAllFields, setShowAllFields] = useState(false);
  const activeHighlight = invoice && highlight?.invoice_id === invoice.id ? highlight : null;
  const { isPulsing, boxRef } = useHighlightPulse(activeHighlight?.nonce);

  if (!invoice) return <EmptyViewer />;
  const page = invoice.pages[0];

  return (
    <section className="flex min-h-0 flex-col border-b border-line bg-canvas min-[1100px]:border-b-0" aria-label="Invoice page">
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-panel px-3 py-2">
        <div className="min-w-0">
          <div className="font-mono text-[13px] font-medium">{escapeText(invoice.invoice_number)}</div>
          <div className="truncate text-xs text-ink-muted">{escapeText(vendorName(invoice))}</div>
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-muted">
          <input type="checkbox" checked={showAllFields} onChange={(e) => setShowAllFields(e.target.checked)} className="accent-amber-600" />
          Show all fields
        </label>
        <button
          type="button"
          onClick={() => closeInvoiceAsHuman(invoice.id)}
          className="rounded-md border border-line px-2 py-1 text-xs text-ink-muted hover:border-line-strong hover:text-ink"
        >
          Close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="relative mx-auto max-w-[880px] bg-white shadow-md ring-1 ring-line" style={{ aspectRatio: `${page.width_px} / ${page.height_px}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- pre-rendered page scan; overlays need the raw box */}
          <img src={page.image} width={page.width_px} height={page.height_px} alt={`${invoice.invoice_number} page ${page.page}`} className="block h-auto w-full" />
          {showAllFields &&
            allBoxes(invoice).map(({ key, bbox }) => (
              <div key={key} title={key} className="pointer-events-none absolute rounded-[2px] outline outline-1 outline-sky-500/60" style={boxStyle(bbox)} />
            ))}
          {activeHighlight && (
            <div
              ref={boxRef}
              className={`pointer-events-none absolute rounded-[2px] bg-amber-400/15 outline outline-2 outline-amber-500 ${isPulsing ? 'animate-pulse' : ''}`}
              style={boxStyle(activeHighlight.bbox)}
            >
              <span className="absolute -top-5 left-0 rounded-sm bg-amber-500 px-1 font-mono text-[10px] font-medium text-black">{activeHighlight.field}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
