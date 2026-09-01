import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Actor, Bbox, InvoiceSeed, IssueType, Severity, Status } from '@/lib/types';
import type { MatchResult } from '@/lib/domain/match';
import type { DuplicateCandidate } from '@/lib/domain/duplicates';
import { SEED_INVOICES, SEED_ORDER } from '@/lib/seed';
import { notifyDecisionResolved } from '@/lib/webmcp/decisions';

export const STORAGE_KEY = 'countersign-v1';
export const STORE_VERSION = 1;
const AUDIT_CAP = 500;

export interface Issue {
  id: string;
  type: IssueType;
  severity: Severity;
  message: string;
  field?: string;
  line?: number;
  created_by: Actor;
  created_at: number;
  resolved: boolean;
  resolution?: 'fixed' | 'waived';
  waive_reason?: string;
}

export interface Comment {
  id: string;
  actor: Actor;
  text: string;
  field?: string;
  created_at: number;
}

export interface GlProposal {
  line: number;
  gl_code: string;
  note?: string;
  accepted: boolean;
}

export type RequestedAction = 'approve' | 'hold' | 'reject';
export type DecisionOutcome = 'pending' | 'approved' | 'held' | 'rejected' | 'dismissed';
export type ResolvedOutcome = Exclude<DecisionOutcome, 'pending'>;

export interface Decision {
  id: string;
  invoice_id: string;
  requested_by: Actor;
  requested_action: RequestedAction;
  rationale: string;
  issue_ids: string[];
  outcome: DecisionOutcome;
  requested_at: number;
  resolved_at?: number;
  resolved_by?: 'human';
}

export interface AuditEntry {
  id: string;
  ts: number;
  actor: Actor | 'system';
  kind: 'tool_call' | 'ui_action';
  name: string;
  invoice_id?: string;
  args_summary: string;
  result_summary: string;
  ok: boolean;
  duration_ms?: number;
}

export interface DuplicateCheck {
  checked_at: number;
  candidates: DuplicateCandidate[];
}

export interface InvoiceState extends InvoiceSeed {
  status: Status;
  issues: Issue[];
  comments: Comment[];
  gl_proposals: GlProposal[];
  match_result?: MatchResult;
  duplicate_check?: DuplicateCheck;
}

export interface Highlight {
  invoice_id: string;
  field: string;
  page: number;
  bbox: Bbox;
  nonce: number;
}

interface PersistedData {
  version: typeof STORE_VERSION;
  seq: number;
  invoices: Record<string, InvoiceState>;
  order: string[];
  openInvoiceId: string | null;
  decisions: Record<string, Decision>;
  audit: AuditEntry[];
}

interface VolatileData {
  highlight: Highlight | null;
  webmcpAvailable: boolean | null;
  registeredTools: string[];
  hydrated: boolean;
}

export type NewIssue = Omit<Issue, 'id' | 'created_at' | 'resolved' | 'resolution' | 'waive_reason'>;
export type NewComment = Omit<Comment, 'id' | 'created_at'>;
export type NewDecision = Omit<Decision, 'id' | 'outcome' | 'requested_at' | 'resolved_at' | 'resolved_by'>;
export type NewAuditEntry = Omit<AuditEntry, 'id' | 'ts'>;

interface Actions {
  openInvoice(id: string): void;
  closeInvoice(): void;
  setHighlight(highlight: Highlight | null): void;
  addIssue(invoiceId: string, issue: NewIssue): Issue;
  resolveIssue(invoiceId: string, issueId: string, resolution: 'fixed' | 'waived', reason?: string): void;
  addComment(invoiceId: string, comment: NewComment): Comment;
  setGlProposals(invoiceId: string, proposals: GlProposal[]): void;
  acceptGl(invoiceId: string, line: number, code: string): void;
  setMatchResult(invoiceId: string, result: MatchResult): void;
  setDuplicateCheck(invoiceId: string, candidates: DuplicateCandidate[]): void;
  createDecision(decision: NewDecision): Decision;
  resolveDecision(decisionId: string, outcome: ResolvedOutcome): void;
  setStatus(invoiceId: string, status: Exclude<Status, 'approved'>): void;
  logAudit(entry: NewAuditEntry): void;
  setWebmcpAvailable(available: boolean): void;
  setToolsRegistered(names: string[], registered: boolean): void;
  setHydrated(hydrated: boolean): void;
  reset(): void;
}

export type Store = PersistedData & VolatileData & Actions;

function seedInvoiceState(seed: InvoiceSeed): InvoiceState {
  return { ...seed, status: seed.initial_status, issues: [], comments: [], gl_proposals: [] };
}

function seedAudit(): AuditEntry[] {
  return SEED_INVOICES.filter((inv) => inv.approved_on).map((inv, index) => ({
    id: `aud_seed_${index + 1}`,
    ts: Date.parse(`${inv.approved_on}T09:00:00Z`),
    actor: 'system',
    kind: 'ui_action',
    name: 'imported_as_approved',
    invoice_id: inv.id,
    args_summary: `{"approved_on":"${inv.approved_on}"}`,
    result_summary: 'Imported from the ERP with status approved.',
    ok: true,
  }));
}

export function freshData(): PersistedData & VolatileData {
  return {
    version: STORE_VERSION,
    seq: 0,
    invoices: Object.fromEntries(SEED_INVOICES.map((inv) => [inv.id, seedInvoiceState(inv)])),
    order: [...SEED_ORDER],
    openInvoiceId: null,
    decisions: {},
    audit: seedAudit(),
    highlight: null,
    webmcpAvailable: null,
    registeredTools: [],
    hydrated: false,
  };
}

// Tests and server rendering have no localStorage; a throwaway store keeps persist quiet there.
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

function requireInvoice(state: Pick<PersistedData, 'invoices'>, id: string): InvoiceState {
  const invoice = state.invoices[id];
  if (!invoice) throw new Error(`Unknown invoice ${id}`);
  return invoice;
}

function patchInvoice(state: Pick<PersistedData, 'invoices'>, id: string, patch: Partial<InvoiceState>) {
  return { invoices: { ...state.invoices, [id]: { ...requireInvoice(state, id), ...patch } } };
}

function outcomeToStatus(outcome: ResolvedOutcome): Status | null {
  switch (outcome) {
    case 'approved':
      return 'approved';
    case 'held':
      return 'held';
    case 'rejected':
      return 'rejected';
    case 'dismissed':
      return null;
  }
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...freshData(),

      openInvoice: (id) =>
        set((state) => {
          requireInvoice(state, id);
          return { openInvoiceId: id, highlight: null };
        }),

      closeInvoice: () => set({ openInvoiceId: null, highlight: null }),

      setHighlight: (highlight) => set({ highlight }),

      addIssue: (invoiceId, issue) => {
        const created: Issue = { ...issue, id: `iss_${get().seq + 1}`, created_at: Date.now(), resolved: false };
        set((state) => ({
          seq: state.seq + 1,
          ...patchInvoice(state, invoiceId, { issues: [...requireInvoice(state, invoiceId).issues, created] }),
        }));
        return created;
      },

      resolveIssue: (invoiceId, issueId, resolution, reason) =>
        set((state) => {
          const issues = requireInvoice(state, invoiceId).issues.map((issue) =>
            issue.id === issueId ? { ...issue, resolved: true, resolution, waive_reason: reason } : issue,
          );
          return patchInvoice(state, invoiceId, { issues });
        }),

      addComment: (invoiceId, comment) => {
        const created: Comment = { ...comment, id: `cmt_${get().seq + 1}`, created_at: Date.now() };
        set((state) => ({
          seq: state.seq + 1,
          ...patchInvoice(state, invoiceId, { comments: [...requireInvoice(state, invoiceId).comments, created] }),
        }));
        return created;
      },

      setGlProposals: (invoiceId, proposals) =>
        set((state) => {
          const incoming = new Map(proposals.map((p) => [p.line, { ...p, accepted: false }]));
          const kept = requireInvoice(state, invoiceId).gl_proposals.filter((p) => !incoming.has(p.line));
          const merged = [...kept, ...incoming.values()].sort((a, b) => a.line - b.line);
          return patchInvoice(state, invoiceId, { gl_proposals: merged });
        }),

      acceptGl: (invoiceId, line, code) =>
        set((state) => {
          const existing = requireInvoice(state, invoiceId).gl_proposals;
          const others = existing.filter((p) => p.line !== line);
          const note = existing.find((p) => p.line === line)?.note;
          const accepted: GlProposal = { line, gl_code: code, note, accepted: true };
          return patchInvoice(state, invoiceId, { gl_proposals: [...others, accepted].sort((a, b) => a.line - b.line) });
        }),

      setMatchResult: (invoiceId, result) => set((state) => patchInvoice(state, invoiceId, { match_result: result })),

      setDuplicateCheck: (invoiceId, candidates) =>
        set((state) => patchInvoice(state, invoiceId, { duplicate_check: { checked_at: Date.now(), candidates } })),

      createDecision: (decision) => {
        const created: Decision = { ...decision, id: `dec_${get().seq + 1}`, outcome: 'pending', requested_at: Date.now() };
        set((state) => ({ seq: state.seq + 1, decisions: { ...state.decisions, [created.id]: created } }));
        return created;
      },

      // The only code path that can move an invoice to approved. Called from CountersignCard.
      resolveDecision: (decisionId, outcome) => {
        const pending = get().decisions[decisionId];
        if (!pending) throw new Error(`Unknown decision ${decisionId}`);
        if (pending.outcome !== 'pending') return;
        const resolved: Decision = { ...pending, outcome, resolved_at: Date.now(), resolved_by: 'human' };
        const status = outcomeToStatus(outcome);
        set((state) => ({
          decisions: { ...state.decisions, [decisionId]: resolved },
          ...(status ? patchInvoice(state, pending.invoice_id, { status }) : {}),
        }));
        notifyDecisionResolved(resolved);
      },

      setStatus: (invoiceId, status) => set((state) => patchInvoice(state, invoiceId, { status })),

      logAudit: (entry) =>
        set((state) => {
          const created: AuditEntry = { ...entry, id: `aud_${state.seq + 1}`, ts: Date.now() };
          return { seq: state.seq + 1, audit: [...state.audit, created].slice(-AUDIT_CAP) };
        }),

      setWebmcpAvailable: (webmcpAvailable) => set({ webmcpAvailable }),
      setToolsRegistered: (names, registered) =>
        set((state) => {
          const without = state.registeredTools.filter((n) => !names.includes(n));
          return { registeredTools: registered ? [...without, ...names] : without };
        }),
      setHydrated: (hydrated) => set({ hydrated }),

      reset: () => {
        const { webmcpAvailable, registeredTools } = get();
        useStore.persist.clearStorage();
        set({ ...freshData(), webmcpAvailable, registeredTools, hydrated: true });
        get().logAudit({
          actor: 'system',
          kind: 'ui_action',
          name: 'reset_demo',
          args_summary: '{}',
          result_summary: `Reloaded ${SEED_ORDER.length} seed invoices.`,
          ok: true,
        });
      },
    }),
    {
      name: STORAGE_KEY,
      version: STORE_VERSION,
      storage: createJSONStorage(() => (typeof localStorage === "undefined" ? memoryStorage() : localStorage)),
      skipHydration: true,
      partialize: (state): PersistedData => ({
        version: state.version,
        seq: state.seq,
        invoices: state.invoices,
        order: state.order,
        openInvoiceId: state.openInvoiceId,
        decisions: state.decisions,
        audit: state.audit,
      }),
      migrate: () => freshData(),
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    },
  ),
);
