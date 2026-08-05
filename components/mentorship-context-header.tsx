"use client";

import { useState } from "react";
import Link from "next/link";

export type MentorshipChatContext = {
  requestId: string;
  title: string;
  description: string;
  answerContent: string | null;
};

type Props = {
  context: MentorshipChatContext;
  /** Compact strip above the compose input. */
  compact?: boolean;
};

export function MentorshipContextHeader({
  context,
  compact = false,
}: Props) {
  const [askOpen, setAskOpen] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);

  if (compact) {
    return (
      <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-xs text-amber-950">
        <p className="font-semibold">Replying about: {context.title}</p>
        {context.description.trim() ? (
          <p className="mt-0.5 line-clamp-2 text-amber-900/80">
            {context.description.trim()}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-amber-200/70 bg-amber-50/60 px-3 py-3 sm:px-4">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800/80">
            Mentorship
          </p>
          <p className="mt-0.5 break-safe text-sm font-bold text-slate-900">
            {context.title}
          </p>
        </div>
        <Link
          href={`/mentors#request-${context.requestId}`}
          className="shrink-0 text-xs font-bold text-teal-800 hover:underline"
        >
          View full request →
        </Link>
      </div>

      {context.description.trim() ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setAskOpen((v) => !v)}
            className="text-xs font-semibold text-amber-950 hover:underline"
            aria-expanded={askOpen}
          >
            {askOpen ? "Hide original ask" : "Show original ask"}
          </button>
          {askOpen ? (
            <p className="mt-1 break-safe whitespace-pre-wrap rounded-lg bg-white/80 px-2.5 py-2 text-xs leading-relaxed text-slate-700">
              {context.description.trim()}
            </p>
          ) : (
            <p className="mt-1 line-clamp-2 break-safe text-xs text-slate-600">
              {context.description.trim()}
            </p>
          )}
        </div>
      ) : null}

      {context.answerContent?.trim() ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setAnswerOpen((v) => !v)}
            className="text-xs font-semibold text-amber-950 hover:underline"
            aria-expanded={answerOpen}
          >
            {answerOpen ? "Hide mentor answer" : "Show mentor answer"}
          </button>
          {answerOpen ? (
            <p className="mt-1 break-safe whitespace-pre-wrap rounded-lg bg-white/80 px-2.5 py-2 text-xs leading-relaxed text-slate-700">
              {context.answerContent.trim()}
            </p>
          ) : (
            <p className="mt-1 line-clamp-2 break-safe text-xs text-slate-600">
              {context.answerContent.trim()}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
