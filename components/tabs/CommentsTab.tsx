'use client';

import { useState, type FormEvent } from 'react';
import { useStore, type Comment } from '@/lib/store';
import { escapeText } from '@/lib/domain/normalize';
import { clockTime } from '@/lib/ui/format';
import { addCommentAsHuman, showFieldAsHuman } from '@/lib/ui/manual';

export interface CommentsTabProps {
  invoiceId: string;
}

const COMMENT_MAX = 500;

function CommentRow({ comment, invoiceId }: { comment: Comment; invoiceId: string }) {
  const isAgent = comment.actor === 'agent';
  return (
    <li className="flex gap-2.5 px-3 py-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold ${
          isAgent ? 'bg-blue-200 text-blue-950' : 'bg-green-200 text-green-950'
        }`}
        aria-hidden="true"
      >
        {isAgent ? 'AI' : 'YOU'}
      </span>
      <div className="min-w-0 flex-1 text-xs">
        <div className="flex items-baseline gap-2">
          <span className="font-medium">{isAgent ? 'Agent' : 'Reviewer'}</span>
          <span className="text-ink-faint">{clockTime(comment.created_at)}</span>
          {comment.field && (
            <button
              type="button"
              onClick={() => showFieldAsHuman(invoiceId, comment.field ?? '')}
              className="rounded-sm bg-accent-soft px-1 font-mono text-[10px] text-amber-900 hover:underline"
              title="Show this field on the page"
            >
              {comment.field}
            </button>
          )}
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words">{escapeText(comment.text)}</p>
      </div>
    </li>
  );
}

export function CommentsTab({ invoiceId }: CommentsTabProps) {
  const comments = useStore((s) => s.invoices[invoiceId].comments);
  const [draft, setDraft] = useState('');

  const handleReplySubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    addCommentAsHuman(invoiceId, text.slice(0, COMMENT_MAX));
    setDraft('');
  };

  return (
    <div className="flex h-full flex-col">
      {comments.length === 0 ? (
        <p className="px-3 py-6 text-xs text-ink-muted">No comments yet. The agent posts here with add_comment; reply below and it shows up in the audit log.</p>
      ) : (
        <ul className="divide-y divide-line">
          {comments.map((c) => (
            <CommentRow key={c.id} comment={c} invoiceId={invoiceId} />
          ))}
        </ul>
      )}
      <form onSubmit={handleReplySubmit} className="mt-auto border-t border-line bg-panel-muted p-3">
        <label htmlFor="comment-reply" className="sr-only">
          Reply
        </label>
        <textarea
          id="comment-reply"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={COMMENT_MAX}
          rows={2}
          placeholder="Reply as the reviewer…"
          className="w-full resize-none rounded-md border border-line bg-panel px-2 py-1.5 text-xs placeholder:text-ink-faint"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-ink-faint">
            {draft.length}/{COMMENT_MAX}
          </span>
          <button
            type="submit"
            disabled={draft.trim() === ''}
            className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-white disabled:bg-slate-300 disabled:text-slate-600"
          >
            Post reply
          </button>
        </div>
      </form>
    </div>
  );
}
