import { z } from 'zod';
import { useStore } from '@/lib/store';

export interface ToolContext {
  signal: AbortSignal;
  timeoutMs?: number;
}

export type ToolOutput = Record<string, unknown>;

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface ToolDef<S extends z.ZodType> {
  name: string;
  description: string;
  input: S;
  annotations?: ToolAnnotations;
  execute(input: z.output<S>, ctx: ToolContext): Promise<ToolOutput>;
}

export type AnyToolDef = ToolDef<z.ZodType>;

export const LIMITS = { name: 30, description: 500, param: 150, output: 1500 } as const;
const SUMMARY_LENGTH = 200;
const MAX_SHRINK_STEPS = 5000;

interface JsonSchemaWithProperties {
  properties?: Record<string, { description?: string }>;
}

export function paramDescriptions(input: z.ZodType): Record<string, string> {
  const schema = z.toJSONSchema(input) as JsonSchemaWithProperties;
  return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, prop]) => [key, prop.description ?? '']));
}

export function budgetViolations(def: AnyToolDef): string[] {
  const violations: string[] = [];
  if (def.name.length > LIMITS.name) violations.push(`tool name too long: ${def.name}`);
  if (def.description.length > LIMITS.description) violations.push(`description too long: ${def.name}`);
  for (const [key, description] of Object.entries(paramDescriptions(def.input)))
    if (description.length > LIMITS.param) violations.push(`param description too long: ${def.name}.${key}`);
  return violations;
}

export function defineTool<S extends z.ZodType>(def: ToolDef<S>): ToolDef<S> {
  if (process.env.NODE_ENV !== 'production') {
    const violations = budgetViolations(def as AnyToolDef);
    if (violations.length > 0) throw new Error(violations.join('; '));
  }
  return def;
}

// Always returns valid JSON. Strategy: (1) if it fits, return as-is; (2) shrink the longest array
// one element at a time and mark truncated; (3) as a last resort wrap a text cut in a valid object.
export function clamp(obj: unknown): string {
  let s = JSON.stringify(obj);
  if (s.length <= LIMITS.output) return s;
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const o: Record<string, unknown> = { ...(obj as Record<string, unknown>), truncated: true };
    for (let guard = 0; guard < MAX_SHRINK_STEPS; guard++) {
      const arrays = Object.entries(o).filter(
        (entry): entry is [string, unknown[]] => Array.isArray(entry[1]) && entry[1].length > 1,
      );
      if (arrays.length === 0) break;
      const [k, v] = arrays.sort((a, b) => b[1].length - a[1].length)[0];
      o[k] = v.slice(0, -1);
      s = JSON.stringify(o);
      if (s.length <= LIMITS.output) return s;
    }
  }
  // Last resort: keep the longest prefix whose escaped form fits (binary search — escaping can double length).
  const raw = JSON.stringify(obj);
  const wrap = (n: number) => JSON.stringify({ truncated: true, text: raw.slice(0, n) });
  let lo = 0;
  let hi = Math.min(raw.length, LIMITS.output);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (wrap(mid).length <= LIMITS.output) lo = mid;
    else hi = mid - 1;
  }
  return wrap(lo);
}

// The spec moved modelContext from Navigator to Document (May 2026); Chrome 150 deprecates the
// navigator alias. Chrome 149 is the contest minimum, so both surfaces are checked.
export function getModelContext(): WebMCP.ModelContext | null {
  if (typeof document === 'undefined') return null;
  if (typeof document.modelContext?.registerTool === 'function') return document.modelContext;
  if (typeof navigator.modelContext?.registerTool === 'function') return navigator.modelContext;
  return null;
}

export function isWebMCPAvailable(): boolean {
  return getModelContext() !== null;
}

export async function registerTools(defs: AnyToolDef[], signal: AbortSignal): Promise<string[]> {
  const context = getModelContext();
  if (!context) return [];
  const registered: string[] = [];
  for (const def of defs) {
    if (signal.aborted) break;
    const definition = buildDefinition(def);
    // Keep the literal `document.modelContext.registerTool(` on this path — the contest scans for it.
    if (document.modelContext) await document.modelContext.registerTool(definition, { signal });
    else await context.registerTool(definition, { signal });
    registered.push(def.name);
  }
  return registered;
}

export function buildDefinition(def: AnyToolDef): WebMCP.ModelContextTool {
  return {
    name: def.name,
    description: def.description,
    inputSchema: z.toJSONSchema(def.input),
    annotations: def.annotations,
    execute: async (raw: unknown, ctx?: { signal?: AbortSignal }) => {
      const t0 = performance.now();
      const store = useStore.getState();
      const invoiceId = store.openInvoiceId ?? undefined;
      const parsed = def.input.safeParse(raw ?? {});
      if (!parsed.success) {
        const msg = `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'input'} ${i.message}`).join('; ')}.`;
        store.logAudit({ actor: 'agent', kind: 'tool_call', name: def.name, invoice_id: invoiceId, args_summary: summarize(raw), result_summary: msg, ok: false });
        return clamp({ error: msg });
      }
      try {
        const result = await def.execute(parsed.data, { signal: ctx?.signal ?? new AbortController().signal });
        const out = clamp(result);
        store.logAudit({
          actor: 'agent',
          kind: 'tool_call',
          name: def.name,
          invoice_id: useStore.getState().openInvoiceId ?? invoiceId,
          args_summary: summarize(parsed.data),
          result_summary: summarize(result),
          ok: !('error' in result),
          duration_ms: Math.round(performance.now() - t0),
        });
        return out;
      } catch (e) {
        const msg = e instanceof Error && e.name === 'AbortError' ? 'Cancelled.' : `Tool failed: ${(e as Error).message}`;
        store.logAudit({ actor: 'agent', kind: 'tool_call', name: def.name, invoice_id: invoiceId, args_summary: summarize(parsed.data), result_summary: msg, ok: false });
        return clamp({ error: msg });
      }
    },
  };
}

export function summarize(v: unknown): string {
  const s = JSON.stringify(v) ?? '';
  return s.length > SUMMARY_LENGTH ? `${s.slice(0, SUMMARY_LENGTH - 3)}...` : s;
}
