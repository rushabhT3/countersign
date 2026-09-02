import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { useStore } from '@/lib/store';
import { E } from '@/lib/webmcp/errors';
import { budgetViolations, buildDefinition, clamp, LIMITS, paramDescriptions, type AnyToolDef } from '@/lib/webmcp/registry';
import { QUEUE_TOOLS } from '@/lib/webmcp/tools/queue';
import { INVOICE_TOOLS } from '@/lib/webmcp/tools/invoice';
import { nextInvoiceId } from '@/lib/domain/next';
import { pendingWaiterCount } from '@/lib/webmcp/decisions';

const ALL_TOOLS: AnyToolDef[] = [...QUEUE_TOOLS, ...INVOICE_TOOLS];
const EXPECTED_NAMES = [
  'list_invoices',
  'open_invoice',
  'get_review_summary',
  'get_decision',
  'get_line_items',
  'run_three_way_match',
  'find_duplicates',
  'get_vendor_profile',
  'show_field_evidence',
  'add_comment',
  'flag_issue',
  'propose_gl_coding',
  'request_countersign',
];

const MINIMAL_INPUT: Record<string, (invoiceId: string) => Record<string, unknown>> = {
  list_invoices: () => ({}),
  open_invoice: (id) => ({ id }),
  get_review_summary: () => ({}),
  get_decision: () => ({ decision_id: 'dec_1' }),
  get_line_items: () => ({}),
  run_three_way_match: () => ({}),
  find_duplicates: () => ({}),
  get_vendor_profile: () => ({}),
  show_field_evidence: () => ({ field: 'total' }),
  add_comment: () => ({ text: 'Checked the totals against the PO.' }),
  flag_issue: () => ({ type: 'tax_error', severity: 'low', message: 'Tax differs from the expected amount.' }),
  propose_gl_coding: () => ({ assignments: [{ line: 1, gl_code: '6210' }] }),
  request_countersign: () => ({ action: 'hold', rationale: 'Automated test request.' }),
};

const ctx = (timeoutMs = 50) => ({ signal: new AbortController().signal, timeoutMs });

function tool(name: string): AnyToolDef {
  const found = ALL_TOOLS.find((t) => t.name === name);
  if (!found) throw new Error(`no tool ${name}`);
  return found;
}

async function run(name: string, raw: Record<string, unknown> = {}, timeoutMs = 50) {
  const def = tool(name);
  return def.execute(def.input.parse(raw), ctx(timeoutMs));
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

beforeEach(() => {
  useStore.getState().reset();
});

describe('tool registry', () => {
  it('exposes exactly the 13 contracted tools in order', () => {
    expect(ALL_TOOLS.map((t) => t.name)).toEqual(EXPECTED_NAMES);
  });

  it('keeps every name, description, and parameter description inside Chrome budgets', () => {
    for (const def of ALL_TOOLS) {
      expect(budgetViolations(def), def.name).toEqual([]);
      expect(def.name.length).toBeLessThanOrEqual(LIMITS.name);
      expect(def.description.length).toBeLessThanOrEqual(LIMITS.description);
      for (const [key, text] of Object.entries(paramDescriptions(def.input))) {
        expect(text.length, `${def.name}.${key}`).toBeLessThanOrEqual(LIMITS.param);
        expect(text.length, `${def.name}.${key} has a description`).toBeGreaterThan(0);
      }
    }
  });

  it('uses positive language in every description', () => {
    for (const def of ALL_TOOLS) {
      expect(def.description, def.name).not.toMatch(/\b(don't|do not|never)\b/i);
    }
  });

  it('marks document-derived outputs as untrusted and reads as read-only', () => {
    expect(tool('get_line_items').annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true });
    expect(tool('get_vendor_profile').annotations?.untrustedContentHint).toBe(true);
    expect(tool('show_field_evidence').annotations?.untrustedContentHint).toBe(true);
    for (const name of ['list_invoices', 'open_invoice', 'get_review_summary', 'get_decision', 'run_three_way_match', 'find_duplicates'])
      expect(tool(name).annotations?.readOnlyHint, name).toBe(true);
    for (const name of ['add_comment', 'flag_issue', 'propose_gl_coding', 'request_countersign'])
      expect(tool(name).annotations?.readOnlyHint, name).toBeFalsy();
  });
});

describe('every tool on every invoice', () => {
  const ids = useStore.getState().order;
  it.each(ids)('%s: all 13 tools return valid JSON under 1500 chars with no error', async (id) => {
    for (const def of ALL_TOOLS) {
      const raw = MINIMAL_INPUT[def.name](id);
      const result = await def.execute(def.input.parse(raw), ctx());
      const out = clamp(result);
      expect(out.length, def.name).toBeLessThanOrEqual(LIMITS.output);
      expect(() => JSON.parse(out), def.name).not.toThrow();
      if (def.name !== 'get_decision') expect(result, def.name).not.toHaveProperty('error');
    }
    expect(pendingWaiterCount()).toBe(0);
  });
});

describe('gating', () => {
  it('every invoice tool refuses when nothing is open', async () => {
    for (const def of INVOICE_TOOLS) {
      const result = await def.execute(def.input.parse(MINIMAL_INPUT[def.name]('inv_001')), ctx());
      expect(result, def.name).toEqual({ error: E.NO_OPEN });
    }
  });

  it('open_invoice reports the nine gated tools and rejects unknown ids', async () => {
    const opened = await run('open_invoice', { id: 'inv_002' });
    expect(opened.tools_now_available).toEqual(EXPECTED_NAMES.slice(4));
    expect(useStore.getState().openInvoiceId).toBe('inv_002');
    expect(await run('open_invoice', { id: 'inv_999' })).toEqual({ error: E.NOT_FOUND('inv_999') });
  });
});

describe('queue tools', () => {
  it('summarises the fresh queue', async () => {
    const summary = await run('get_review_summary');
    expect(summary).toMatchObject({
      by_status: { needs_review: 8, flagged: 0, held: 0, approved: 1, rejected: 0 },
      pending_count: 8,
      pending_total: 41835.35,
      high_severity_invoices: 0,
      next_invoice_id: 'inv_001',
    });
  });

  it('filters and limits the list', async () => {
    const apex = (await run('list_invoices', { vendor: 'APEX' })) as { count: number; invoices: { id: string }[] };
    expect(apex.invoices.map((i) => i.id)).toEqual(['inv_001', 'inv_004a', 'inv_004b']);
    const approved = (await run('list_invoices', { status: 'approved' })) as { invoices: { id: string }[] };
    expect(approved.invoices.map((i) => i.id)).toEqual(['inv_004a']);
    const big = (await run('list_invoices', { min_total: 8000, limit: 1 })) as { count: number; invoices: unknown[] };
    expect(big.count).toBe(3);
    expect(big.invoices).toHaveLength(1);
  });

  it('get_decision explains an unknown id', async () => {
    expect(await run('get_decision', { decision_id: 'dec_404' })).toEqual({ error: E.DECISION_NOT_FOUND('dec_404') });
  });
});

describe('invoice tools', () => {
  it('paginates line items', async () => {
    await run('open_invoice', { id: 'inv_001' });
    const first = await run('get_line_items', { limit: 1 });
    expect(first).toMatchObject({ total_lines: 3, offset: 0, next_offset: 1 });
    expect(first.lines).toHaveLength(1);
    const last = await run('get_line_items', { offset: 2, limit: 1 });
    expect(last.next_offset).toBeNull();
  });

  it('stores the match result on the invoice', async () => {
    await run('open_invoice', { id: 'inv_002' });
    const result = await run('run_three_way_match');
    expect(result.result).toBe('mismatch');
    expect(useStore.getState().invoices.inv_002.match_result?.result).toBe('mismatch');
  });

  it('finds the approved original for the duplicate', async () => {
    await run('open_invoice', { id: 'inv_004b' });
    const result = (await run('find_duplicates')) as { candidates: { id: string; status: string }[] };
    expect(result.candidates[0]).toMatchObject({ id: 'inv_004a', status: 'approved' });
  });

  it('exposes the bank change on the Harbor invoice', async () => {
    await run('open_invoice', { id: 'inv_005' });
    const profile = await run('get_vendor_profile');
    expect(profile).toMatchObject({ bank_on_file_last4: '5567', bank_on_invoice_last4: '8812', bank_matches: false, bank_last_changed: '2026-07-28' });
  });

  it('highlights fields and lists valid keys on a miss', async () => {
    await run('open_invoice', { id: 'inv_002' });
    const qty = await run('show_field_evidence', { field: 'line:1:qty' });
    expect(qty).toMatchObject({ field: 'line:1:qty', value: '120', page: 1, highlighted: true });
    expect(useStore.getState().highlight?.field).toBe('line:1:qty');
    const miss = (await run('show_field_evidence', { field: 'grand_total' })) as { error: string };
    expect(miss.error).toContain('Unknown field "grand_total"');
    expect(miss.error).toContain('line:<1-3>:<description|qty|unit_price|amount>');
  });

  it('dedupes flagged issues and moves the invoice to flagged', async () => {
    await run('open_invoice', { id: 'inv_002' });
    const first = await run('flag_issue', { type: 'qty_mismatch', severity: 'high', message: 'Line 1 bills 120, received 100', line: 1 });
    const second = await run('flag_issue', { type: 'qty_mismatch', severity: 'high', message: 'Again', line: 1 });
    expect(first).toMatchObject({ status: 'flagged', duplicate: false, open_issue_count: 1 });
    expect(second).toMatchObject({ issue_id: first.issue_id, duplicate: true, open_issue_count: 1 });
    expect(await run('flag_issue', { type: 'qty_mismatch', severity: 'high', message: 'x', line: 9 })).toEqual({ error: E.LINE(9, 3) });
  });

  it('rejects an unknown GL code atomically and lists valid codes', async () => {
    await run('open_invoice', { id: 'inv_006' });
    const result = (await run('propose_gl_coding', { assignments: [{ line: 1, gl_code: '6210' }, { line: 2, gl_code: '9999' }] })) as { error: string };
    expect(result.error).toContain('Unknown GL code "9999"');
    expect(result.error).toContain('6210');
    expect(useStore.getState().invoices.inv_006.gl_proposals).toEqual([]);
    const ok = await run('propose_gl_coding', { assignments: [{ line: 1, gl_code: '6210' }, { line: 2, gl_code: '6220' }] });
    expect(ok).toMatchObject({ proposed: 2, pending_human_acceptance: true });
    expect(useStore.getState().invoices.inv_006.gl_proposals.every((p) => !p.accepted)).toBe(true);
  });

  it('pins comments to a field and rejects unknown fields', async () => {
    await run('open_invoice', { id: 'inv_005' });
    const comment = await run('add_comment', { text: 'Please verify the bank change by phone.', field: 'bank_account' });
    expect(comment).toMatchObject({ invoice_id: 'inv_005', field: 'bank_account' });
    expect(useStore.getState().invoices.inv_005.comments[0].actor).toBe('agent');
    expect((await run('add_comment', { text: 'x', field: 'nope' })) as { error: string }).toHaveProperty('error');
  });
});

describe('reviewer replies reach the agent', () => {
  const longReply = 'Confirmed with receiving: '.padEnd(500, 'x');

  it('open_invoice carries the newest three reviewer replies, truncated, inside budget', async () => {
    await run('open_invoice', { id: 'inv_002' });
    const store = useStore.getState();
    for (let n = 1; n <= 4; n += 1) store.addComment('inv_002', { actor: 'human', text: String(n) + ' ' + longReply, field: n === 4 ? 'line:1:qty' : undefined });
    store.addComment('inv_002', { actor: 'agent', text: 'Noted.' });
    const opened = (await run('open_invoice', { id: 'inv_002' })) as { reviewer_replies: { comment_id: string; text: string; field: string | null }[] };
    expect(opened.reviewer_replies).toHaveLength(3);
    expect(opened.reviewer_replies.map((r) => r.text[0])).toEqual(['2', '3', '4']);
    expect(opened.reviewer_replies[2]).toMatchObject({ field: 'line:1:qty' });
    expect(opened.reviewer_replies.every((r) => r.text.length <= 100)).toBe(true);
    const out = clamp(opened);
    expect(out.length).toBeLessThanOrEqual(LIMITS.output);
    expect(JSON.parse(out)).not.toHaveProperty('truncated');
  });

  it('get_decision shows a reply typed after the countersign request', async () => {
    await run('open_invoice', { id: 'inv_005' });
    const requested = (await run('request_countersign', { action: 'hold', rationale: 'Bank changed.' })) as { decision_id: string; reviewer_replies?: unknown };
    useStore.getState().addComment('inv_005', { actor: 'human', text: 'Called the vendor; the new account is legitimate.' });
    const decision = (await run('get_decision', { decision_id: requested.decision_id })) as { reviewer_replies: { text: string }[] };
    expect(decision.reviewer_replies).toEqual([expect.objectContaining({ text: 'Called the vendor; the new account is legitimate.', field: null })]);
    expect(clamp(decision).length).toBeLessThanOrEqual(LIMITS.output);
  });

  it('is empty when the reviewer has not replied', async () => {
    const opened = await run('open_invoice', { id: 'inv_001' });
    expect(opened.reviewer_replies).toEqual([]);
  });
});

describe('request_countersign', () => {
  it('returns pending on timeout and the same decision on a repeat call', async () => {
    await run('open_invoice', { id: 'inv_001' });
    const first = await run('request_countersign', { action: 'approve', rationale: 'Clean match.' });
    expect(first).toMatchObject({ outcome: 'pending', invoice_status: 'needs_review', next_invoice_id: 'inv_002' });
    const second = await run('request_countersign', { action: 'reject', rationale: 'Changed my mind.' });
    expect(second.decision_id).toBe(first.decision_id);
    expect(useStore.getState().decisions[first.decision_id as string].requested_action).toBe('approve');
    expect(pendingWaiterCount()).toBe(0);
  });

  it('lists blockers while the match is missing and clears them after a clean match', async () => {
    await run('open_invoice', { id: 'inv_001' });
    const before = await run('request_countersign', { action: 'approve', rationale: 'Looks fine.' });
    expect(before.blockers).toEqual(['three-way match not run and 3 lines without GL code']);
    await run('run_three_way_match');
    const after = await run('request_countersign', { action: 'approve', rationale: 'Looks fine.' });
    expect(after.blockers).toEqual([]);
  });

  it('resolves as soon as the human clicks', async () => {
    await run('open_invoice', { id: 'inv_007' });
    const pending = run('request_countersign', { action: 'hold', rationale: 'Please review.' }, 5000);
    await new Promise((r) => setTimeout(r, 10));
    const id = Object.keys(useStore.getState().decisions)[0];
    useStore.getState().resolveDecision(id, 'held');
    const result = await pending;
    expect(result).toMatchObject({ decision_id: id, outcome: 'held', invoice_status: 'held', next_invoice_id: 'inv_008' });
    expect((await run('get_decision', { decision_id: id })).outcome).toBe('held');
  });

  it('only resolveDecision can approve, and approval flows to the invoice', async () => {
    await run('open_invoice', { id: 'inv_001' });
    await run('request_countersign', { action: 'approve', rationale: 'Clean.' });
    const id = Object.keys(useStore.getState().decisions)[0];
    useStore.getState().resolveDecision(id, 'approved');
    expect(useStore.getState().invoices.inv_001.status).toBe('approved');
    expect(useStore.getState().decisions[id]).toMatchObject({ outcome: 'approved', resolved_by: 'human' });
  });

  it('is cancelled by the abort signal and leaves the decision pending', async () => {
    await run('open_invoice', { id: 'inv_003' });
    const controller = new AbortController();
    const def = tool('request_countersign');
    const wrapped = buildDefinition(def);
    const pending = wrapped.execute(
      { action: 'hold', rationale: 'Hold for pricing.' },
      { signal: controller.signal },
    );
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();
    expect(await pending).toBe(JSON.stringify({ error: 'Cancelled.' }));
    const decision = Object.values(useStore.getState().decisions)[0];
    expect(decision.outcome).toBe('pending');
    expect(pendingWaiterCount()).toBe(0);
  });
});

describe('wrapper', () => {
  it('turns invalid input into an error string and logs the call', async () => {
    const wrapped = buildDefinition(tool('open_invoice'));
    const out = await wrapped.execute({}, { signal: new AbortController().signal });
    expect(JSON.parse(out as string).error).toMatch(/^Invalid input: id /);
    const last = useStore.getState().audit.at(-1);
    expect(last).toMatchObject({ actor: 'agent', kind: 'tool_call', name: 'open_invoice', ok: false });
  });

  it('logs successful calls with duration', async () => {
    const wrapped = buildDefinition(tool('get_review_summary'));
    await wrapped.execute({}, { signal: new AbortController().signal });
    const last = useStore.getState().audit.at(-1);
    expect(last).toMatchObject({ name: 'get_review_summary', ok: true });
    expect(typeof last?.duration_ms).toBe('number');
  });
});

describe('clamp', () => {
  it('passes small objects through untouched', () => {
    expect(clamp({ a: 1 })).toBe('{"a":1}');
  });

  it('trims the longest array and marks truncation', () => {
    const big = { rows: Array.from({ length: 400 }, (_, i) => ({ i, text: 'x'.repeat(20) })), note: 'n' };
    const out = clamp(big);
    expect(out.length).toBeLessThanOrEqual(LIMITS.output);
    const parsed = JSON.parse(out);
    expect(parsed.truncated).toBe(true);
    expect(parsed.rows.length).toBeLessThan(400);
    expect(parsed.note).toBe('n');
  });

  it('wraps an oversized scalar in a valid object', () => {
    const out = clamp({ text: '"'.repeat(3000) });
    expect(out.length).toBeLessThanOrEqual(LIMITS.output);
    expect(JSON.parse(out).truncated).toBe(true);
  });
});

describe('next invoice', () => {
  it('wraps around and skips non-pending invoices', () => {
    const order = ['a', 'b', 'c'];
    const status = (id: string) => ({ a: 'needs_review', b: 'approved', c: 'flagged' })[id] as 'needs_review' | 'approved' | 'flagged';
    expect(nextInvoiceId(order, status, 'c')).toBe('a');
    expect(nextInvoiceId(order, status, 'a')).toBe('c');
    expect(nextInvoiceId(order, status, null)).toBe('a');
    expect(nextInvoiceId(order, () => 'approved', 'a')).toBeNull();
    expect(nextInvoiceId(['a'], () => 'needs_review', 'a')).toBeNull();
  });
});

describe('approval is a human-only path', () => {
  const root = join(__dirname, '..');
  const files = [...listSourceFiles(join(root, 'lib')), ...listSourceFiles(join(root, 'components'))];

  it('no source outside lib/store.ts assigns the approved status', () => {
    const assignsApproved = /(status\s*[:=]\s*['"]approved['"])|setStatus\([^)]*['"]approved['"]/;
    const offenders = files
      .filter((f) => relative(root, f).replace(/\\/g, '/') !== 'lib/store.ts')
      .filter((f) => assignsApproved.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it('only CountersignCard calls resolveDecision', () => {
    const callers = files
      .filter((f) => /\bresolveDecision\(/.test(readFileSync(f, 'utf8').replace(/resolveDecision\((decisionId|decisionId: string)/g, '')))
      .map((f) => relative(root, f).replace(/\\/g, '/'))
      .filter((f) => f !== 'lib/store.ts');
    expect(callers).toEqual(['components/CountersignCard.tsx']);
  });
});
