'use client';

import { useEffect, useRef, useState } from 'react';

export interface CopyButtonProps {
  text: string;
  label: string;
}

const COPIED_MS = 1500;

export function CopyButton({ text, label }: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const handleCopyClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setIsCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setIsCopied(false), COPIED_MS);
  };

  return (
    <button
      type="button"
      onClick={handleCopyClick}
      aria-label={label}
      className={`shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium ${
        isCopied ? 'border-green-300 bg-green-100 text-green-900' : 'border-line bg-panel text-ink-muted hover:border-line-strong hover:text-ink'
      }`}
    >
      {isCopied ? 'copied' : 'copy'}
    </button>
  );
}
