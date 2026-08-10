"use client";

import { useEffect, useState } from "react";
import { AppModal } from "@/components/ui/app-modal";
import {
  REPORT_REASONS,
  type ReportReasonId,
} from "@/lib/safety";

type Panel = "menu" | "report" | "confirmBlock" | "confirmDisconnect";

type Props = {
  open: boolean;
  partnerName: string;
  busy: boolean;
  /** Shown inside the sheet so RPC failures aren't hidden behind the modal. */
  error?: string | null;
  onClose: () => void;
  onDisconnect: () => void;
  onBlock: () => void;
  onReport: (reason: ReportReasonId, details: string, alsoBlock: boolean) => void;
};

/**
 * Safety actions for an active chat: unmatch, block, report.
 * Mirrors mobile ChatSafetySheet (Disconnect → Unmatch label for discoverability).
 */
export function ChatSafetySheet({
  open,
  partnerName,
  busy,
  error = null,
  onClose,
  onDisconnect,
  onBlock,
  onReport,
}: Props) {
  const [panel, setPanel] = useState<Panel>("menu");
  const [reason, setReason] = useState<ReportReasonId | null>(null);
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);

  useEffect(() => {
    if (!open) return;
    setPanel("menu");
    setReason(null);
    setDetails("");
    setAlsoBlock(true);
  }, [open, partnerName]);

  function resetAndClose() {
    if (busy) return;
    setPanel("menu");
    setReason(null);
    setDetails("");
    setAlsoBlock(true);
    onClose();
  }

  const title =
    panel === "confirmDisconnect"
      ? `Unmatch ${partnerName}?`
      : panel === "confirmBlock"
        ? `Block ${partnerName}?`
        : panel === "report"
          ? `Report ${partnerName}`
          : "Safety";

  const description =
    panel === "menu"
      ? "You're in control. Blocking stops all messages permanently. Unmatch leaves this chat without a permanent block."
      : panel === "confirmDisconnect"
        ? "Messaging stops. You can reconnect later from Network if you change your mind."
        : panel === "confirmBlock"
          ? "They can't message you again. This stays private — we don't tell them you blocked them."
          : "Reports are reviewed by Cohortly. False reports may affect your account.";

  return (
    <AppModal
      open={open}
      onClose={resetAndClose}
      title={title}
      description={description}
    >
      {error ? (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </p>
      ) : null}

      {panel === "menu" ? (
        <div className="space-y-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setPanel("confirmDisconnect")}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 disabled:opacity-60"
          >
            <span className="block text-sm font-semibold text-slate-900">
              Unmatch
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Leave this chat. They can&apos;t message you unless you connect
              again.
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPanel("confirmBlock")}
            className="w-full rounded-xl border border-red-100 bg-red-50/60 px-4 py-3 text-left transition hover:bg-red-50 disabled:opacity-60"
          >
            <span className="block text-sm font-semibold text-red-700">
              Block
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Permanently stop messages with {partnerName}. They won&apos;t be
              notified.
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPanel("report")}
            className="w-full rounded-xl border border-red-100 bg-red-50/60 px-4 py-3 text-left transition hover:bg-red-50 disabled:opacity-60"
          >
            <span className="block text-sm font-semibold text-red-700">
              Report
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Tell us what happened. You can also block them in the same step.
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={resetAndClose}
            className="w-full py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {panel === "confirmDisconnect" ? (
        <div className="space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={onDisconnect}
            className="w-full rounded-xl bg-slate-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {busy ? "Working…" : "Unmatch"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPanel("menu")}
            className="w-full py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Back
          </button>
        </div>
      ) : null}

      {panel === "confirmBlock" ? (
        <div className="space-y-3">
          <button
            type="button"
            disabled={busy}
            onClick={onBlock}
            className="w-full rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-800 disabled:opacity-60"
          >
            {busy ? "Working…" : "Block"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPanel("menu")}
            className="w-full py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Back
          </button>
        </div>
      ) : null}

      {panel === "report" ? (
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
          <button
            type="button"
            disabled={busy || !reason}
            onClick={() => {
              if (!reason) return;
              onReport(reason, details, alsoBlock);
            }}
            className="w-full rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-800 disabled:opacity-45"
          >
            {busy ? "Submitting…" : "Submit report"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPanel("menu")}
            className="w-full py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Back
          </button>
        </div>
      ) : null}
    </AppModal>
  );
}
