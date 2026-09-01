import type { Decision } from '@/lib/store';

// Resolvers for in-flight request_countersign calls, keyed by decision id. The store calls
// notifyDecisionResolved from resolveDecision; this module has no store import so there is no cycle.
const waiters = new Map<string, (decision: Decision) => void>();

export function waitForDecision(decisionId: string): Promise<Decision> {
  return new Promise((resolve) => {
    waiters.set(decisionId, resolve);
  });
}

export function cancelDecisionWait(decisionId: string): void {
  waiters.delete(decisionId);
}

export function notifyDecisionResolved(decision: Decision): void {
  const resolve = waiters.get(decision.id);
  if (!resolve) return;
  waiters.delete(decision.id);
  resolve(decision);
}

export function pendingWaiterCount(): number {
  return waiters.size;
}
