"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppModal } from "@/components/ui/app-modal";
import { createClient } from "@/lib/supabase/client";
import {
  REPORT_REASONS,
  reportUser,
  type ReportReasonId,
} from "@/lib/safety";

type Props = {
  open: boolean;
  reportedId: string;
  reportedName: string;
  conversationId?: string | null;
  onClose: () => void;
  onSubmitted?: () => void;
};

/** Standalone report flow (profile preview, etc.). */
export function ReportUserModal({
  open,
  reportedId,
  reportedName,
  conversationId = null,
  onClose,
  onSubmitted,
}: Props) {
  const [reason, setReason] = useState<ReportReasonId | null>(null);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(Boolean(conversationId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason(null);
    setDetails("");
    setAlsoBlock(Boolean(conversationId));
    setBusy(false);
    setError(null);
    setDone(false);
  }, [open, reportedId, conversationId]);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await reportUser(supabase, {
      reportedId,
      reason,
      details,
      conversationId,
      alsoBlock: conversationId ? alsoBlock : false,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setDone(true);
    onSubmitted?.();
  }

  return (
    <AppModal
      open={open}
      onClose={() => {
        if (busy) return;
        onClose();
      }}
      title={done ? "Report submitted" : `Report ${reportedName}`}
      description={
        done
          ? "Thanks — we’ll review this. If you’re in an active chat, use Safety there to block or unmatch."
          : "Reports are reviewed by Cohortly. False reports may affect your account."
      }
    >
      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </p>
      ) : null}

      {done ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Read our{" "}
            <Link
              href="/guidelines#safety"
              className="font-semibold text-[var(--brand)] hover:underline"
              onClick={onClose}
            >
              Community Guidelines
            </Link>{" "}
            for what we look for and how to stay safe.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-white"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {REPORT_REASONS.map((r) => {
              const on = reason === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setReason(r.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    on
                      ? "border-teal-600 bg-teal-50 text-teal-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Optional details (what happened)"
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
          {conversationId ? (
            <label className="flex min-h-11 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={alsoBlock}
                onChange={(e) => setAlsoBlock(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
              />
              <span className="text-sm font-medium text-slate-800">
                Also block this person
              </span>
            </label>
          ) : null}
          <button
            type="button"
            disabled={busy || !reason}
            onClick={() => void submit()}
            className="w-full rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-800 disabled:opacity-45"
          >
            {busy ? "Submitting…" : "Submit report"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-full py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      )}
    </AppModal>
  );
}
