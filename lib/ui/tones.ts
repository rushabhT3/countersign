import type { LineVerdict, MatchOutcome } from '@/lib/domain/match';
import type { Severity, Status } from '@/lib/types';

export type Tone = 'slate' | 'amber' | 'yellow' | 'green' | 'red' | 'blue' | 'orange';

export const TONE_CLASSES: Record<Tone, string> = {
  slate: 'bg-slate-200 text-slate-900',
  amber: 'bg-amber-200 text-amber-950',
  yellow: 'bg-yellow-200 text-yellow-950',
  green: 'bg-green-200 text-green-950',
  red: 'bg-red-200 text-red-950',
  blue: 'bg-blue-200 text-blue-950',
  orange: 'bg-orange-200 text-orange-950',
};

export function statusTone(status: Status): Tone {
  switch (status) {
    case 'needs_review':
      return 'slate';
    case 'flagged':
      return 'amber';
    case 'held':
      return 'yellow';
    case 'approved':
      return 'green';
    case 'rejected':
      return 'red';
  }
}

export function severityTone(severity: Severity): Tone {
  switch (severity) {
    case 'low':
      return 'slate';
    case 'medium':
      return 'amber';
    case 'high':
      return 'red';
  }
}

export function verdictTone(verdict: LineVerdict): Tone {
  switch (verdict) {
    case 'ok':
      return 'green';
    case 'qty_over_received':
    case 'qty_over_ordered':
      return 'red';
    case 'price_over_tolerance':
      return 'orange';
    case 'line_not_on_po':
      return 'slate';
  }
}

export function outcomeTone(outcome: MatchOutcome): Tone {
  switch (outcome) {
    case 'match':
      return 'green';
    case 'mismatch':
      return 'red';
    case 'no_po':
      return 'amber';
  }
}
