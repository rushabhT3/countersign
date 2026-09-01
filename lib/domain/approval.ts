import type { MatchResult } from '@/lib/domain/match';

interface ApprovalSubject {
  issues: { resolved: boolean }[];
  gl_proposals: { line: number; accepted: boolean }[];
  line_items: { line: number }[];
  match_result?: MatchResult;
}

export function openIssueCount(subject: Pick<ApprovalSubject, 'issues'>): number {
  return subject.issues.filter((i) => !i.resolved).length;
}

export function linesWithoutAcceptedGl(subject: Pick<ApprovalSubject, 'gl_proposals' | 'line_items'>): number[] {
  const accepted = new Set(subject.gl_proposals.filter((p) => p.accepted).map((p) => p.line));
  return subject.line_items.map((l) => l.line).filter((line) => !accepted.has(line));
}

// Approve is allowed only with zero open issues and either a clean three-way match or
// a human-accepted GL code on every line. An empty list means Approve is enabled.
export function approvalBlockers(subject: ApprovalSubject): string[] {
  const blockers: string[] = [];
  const open = openIssueCount(subject);
  if (open > 0) blockers.push(`${open} open issue${open === 1 ? '' : 's'}`);
  if (subject.match_result?.result === 'match') return blockers;
  const uncoded = linesWithoutAcceptedGl(subject).length;
  if (uncoded === 0) return blockers;
  const prefix = subject.match_result ? '' : 'three-way match not run and ';
  blockers.push(`${prefix}${uncoded} line${uncoded === 1 ? '' : 's'} without GL code`);
  return blockers;
}

export function canApprove(subject: ApprovalSubject): boolean {
  return approvalBlockers(subject).length === 0;
}
