"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AppModal } from "@/components/ui/app-modal";
import { firstName } from "@/lib/network";
import { INTRO_MESSAGE_MAX, mapMessagingError } from "@/lib/conversations";
import { createClient } from "@/lib/supabase/client";

type Props = {
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  recipientId: string;
  recipientName: string | null;
  onSent: (recipientId: string) => void;
};

export function ConnectionRequestModal({
  open,
  onClose,
  currentUserId,
  recipientId,
  recipientName,
  onSent,
}: Props) {
  const displayName = recipientName?.trim() || firstName(recipientName);
  const shortName = firstName(recipientName);
  const [draft, setDraft] = useState(`Hi ${shortName}, I'd love to connect!`);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(`Hi ${firstName(recipientName)}, I'd love to connect!`);
    setError(null);
    setSending(false);
  }, [open, recipientName]);

  const remaining = INTRO_MESSAGE_MAX - draft.length;
  const trimmed = draft.trim();
  const tooLong = draft.length > INTRO_MESSAGE_MAX;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!trimmed || tooLong || sending) return;

    setSending(true);
    setError(null);

    const supabase = createClient();
    const { error: insertError } = await supabase.from("messages").insert({
      sender_id: currentUserId,
      receiver_id: recipientId,
      content: trimmed.slice(0, INTRO_MESSAGE_MAX),
      read: false,
    });

    if (insertError) {
      setError(mapMessagingError(insertError));
      setSending(false);
      return;
    }

    setSending(false);
    onSent(recipientId);
  }

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Send a connection request"
      description={
        <>
          You can send one message.{" "}
          <span
            title={displayName}
            className="inline-block max-w-[14rem] truncate align-bottom font-semibold text-slate-800 sm:max-w-[18rem]"
          >
            {displayName}
          </span>{" "}
          needs to accept before you can keep chatting.
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="sr-only">Intro message</span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            maxLength={INTRO_MESSAGE_MAX + 20}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            placeholder="Write a short intro…"
            autoFocus
          />
        </label>

        <div className="flex items-center justify-between gap-2 text-xs">
          <span
            className={
              remaining < 0
                ? "font-semibold text-red-600"
                : remaining <= 40
                  ? "text-amber-700"
                  : "text-slate-400"
            }
          >
            {remaining < 0
              ? `${Math.abs(remaining)} over limit`
              : `${remaining} characters left`}
          </span>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending || !trimmed || tooLong}
            className="btn-primary flex-1 disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send request"}
          </button>
        </div>
      </form>
    </AppModal>
  );
}
