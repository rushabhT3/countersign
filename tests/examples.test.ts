import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '@/lib/store';
import { exampleInput, focusField, suggestedIssue } from '@/lib/webmcp/examples';
import { QUEUE_TOOLS } from '@/lib/webmcp/tools/queue';
import { INVOICE_TOOLS } from '@/lib/webmcp/tools/invoice';
import type { AnyToolDef } from '@/lib/webmcp/registry';

const ALL_TOOLS: AnyToolDef[] = [...QUEUE_TOOLS, ...INVOICE_TOOLS];
const ctx = () => ({ signal: new AbortController().signal, timeoutMs: 50 });

function tool(name: string): AnyToolDef {
  const found = ALL_TOOLS.find((t) => t.name === name);
  if (!found) throw new Error(`no tool ${name}`);
  return found;
}

async function call(name: string, raw: Record<string, unknown> = {}) {
  const def = tool(name);
  return def.execute(def.input.parse(raw), ctx());
}

function exampleFor(name: string) {
  return exampleInput(name, useStore.getState());
}

async function runExample(name: string) {
  const example = exampleFor(name);
  if (!example) throw new Error(`no example for ${name}`);
  const def = tool(name);
  const parsed = def.input.safeParse(example);
  expect(parsed.success, `${name}: ${JSON.stringify(example)}`).toBe(true);
  return def.execute(def.input.parse(example), ctx());
}

beforeEach(() => {
  useStore.getState().reset();
});

describe('examples with nothing open', () => {
  it('queue tools have valid examples and invoice tools have none', () => {
    for (const def of QUEUE_TOOLS) {
      const example = exampleFor(def.name);
      if (def.name === 'get_decision') expect(example).toBeNull();
      else expect(def.input.safeParse(example).success, def.name).toBe(true);
    }
    for (const def of INVOICE_TOOLS) expect(exampleFor(def.name), def.name).toBeNull();
  });

  it('open_invoice points at the first pending invoice', () => {
    expect(exampleFor('open_invoice')).toEqual({ id: 'inv_001' });
  });
});

describe('examples on an open invoice', () => {
  it('every tool example parses and executes without error on NP-88120 after the match', async () => {
    await call('open_invoice', { id: 'inv_002' });
    await call('run_three_way_match');
    for (const def of ALL_TOOLS) {
      if (def.name === 'get_decision') continue;
      const result = await runExample(def.name);
      expect(result, def.name).not.toHaveProperty('error');
    }
    const decision = exampleFor('get_decision') as { decision_id: string };
    expect(decision.decision_id).toMatch(/^dec_/);
    expect(await runExample('get_decision')).toMatchObject({ outcome: 'pending', invoice_id: 'inv_002' });
  });

  it('fills flag_issue from the match finding and points evidence at the same line', async () => {
    await call('open_invoice', { id: 'inv_002' });
    expect(exampleFor('flag_issue')).toBeNull();
    await call('run_three_way_match');
    expect(exampleFor('flag_issue')).toEqual({ type: 'qty_mismatch', severity: 'high', message: 'Line 1: invoiced 120, received 100', line: 1 });
    expect(exampleFor('show_field_evidence')).toEqual({ field: 'line:1:qty' });
    expect(exampleFor('request_countersign')).toMatchObject({ action: 'hold', issue_ids: [] });
  });

  it('carries real issue ids into request_countersign once an issue is flagged', async () => {
    await call('open_invoice', { id: 'inv_002' });
    const flagged = (await call('flag_issue', { type: 'qty_mismatch', severity: 'high', message: 'Line 1 bills 120, received 100', line: 1 })) as { issue_id: string };
    expect(exampleFor('request_countersign')).toMatchObject({ action: 'hold', rationale: 'Line 1 bills 120, received 100', issue_ids: [flagged.issue_id] });
  });

  it('suggests a reject on the duplicate after the search runs', async () => {
    await call('open_invoice', { id: 'inv_004b' });
    await call('find_duplicates');
    expect(suggestedIssue(useStore.getState().invoices.inv_004b)).toMatchObject({ type: 'duplicate', severity: 'high', field: 'invoice_number' });
    expect(exampleFor('request_countersign')).toMatchObject({ action: 'reject' });
  });

  it('sees the bank change on HOI-3391 before any tool runs', async () => {
    await call('open_invoice', { id: 'inv_005' });
    const invoice = useStore.getState().invoices.inv_005;
    expect(suggestedIssue(invoice)).toMatchObject({ type: 'vendor_risk', field: 'bank_account' });
    expect(focusField(invoice)).toBe('bank_account');
  });

  it('proposes the software GL code for both Cobalt lines', async () => {
    await call('open_invoice', { id: 'inv_006' });
    expect(exampleFor('propose_gl_coding')).toEqual({ assignments: [{ line: 1, gl_code: '6210' }, { line: 2, gl_code: '6210' }] });
  });

  it('recommends approve on a clean invoice after a clean match', async () => {
    await call('open_invoice', { id: 'inv_001' });
    await call('run_three_way_match');
    expect(exampleFor('flag_issue')).toBeNull();
    expect(exampleFor('request_countersign')).toMatchObject({ action: 'approve', issue_ids: [] });
    expect(exampleFor('show_field_evidence')).toEqual({ field: 'total' });
  });

  it('falls back to the least confident header field on HOI-3402', async () => {
    await call('open_invoice', { id: 'inv_008' });
    expect(focusField(useStore.getState().invoices.inv_008)).toBe('tax');
  });
});
