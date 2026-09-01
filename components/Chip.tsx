import type { ReactNode } from 'react';
import { TONE_CLASSES, type Tone } from '@/lib/ui/tones';

export interface ChipProps {
  tone: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Chip({ tone, children, className = '', title }: ChipProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-4 tracking-wide whitespace-nowrap ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
