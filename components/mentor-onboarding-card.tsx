"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SectionCard } from "@/components/ui/section-card";

type Props = {
  mentorId: string;
};

/**
 * One-time graduate prompt: confirm mentoring before is_available can be true.
 * Declining sets onboarding_state='declined' and never auto-asks again.
 */
export function MentorOnboardingCard({ mentorId }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) return null;

  async function respond(choice: "confirm" | "decline") {
    setBusy(choice);
    setError(null);

    const payload = {
      mentor_id: mentorId,
      is_available: choice === "confirm",
      is_paused: false,
      onboarding_state:
        choice === "confirm"
          ? ("confirmed" as const)
          : ("declined" as const),
      session_lengths: [30, 60],
      max_open_requests: 5,
    };

    const { error: upsertError } = await supabase
      .from("mentor_availability")
      .upsert(payload, { onConflict: "mentor_id" });

    if (upsertError) {
      setError(
        upsertError.message.includes("row-level security")
          ? "Couldn't save that. Make sure the graduate-mentor SQL has been applied."
          : upsertError.message || "Couldn't save your choice.",
      );
      setBusy(null);
      return;
    }

    setDone(true);
    setBusy(null);
    router.refresh();
  }

  return (
    <SectionCard stagger={1} className="mb-5 border-teal-200 bg-teal-50/60 sm:mb-6">
      <p className="text-sm font-semibold text-teal-950 sm:text-base">
        Juniors are looking for guidance. Want students to be able to ask you
        questions? You choose what to answer and can pause anytime.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void respond("confirm")}
          className="btn-primary disabled:opacity-60"
        >
          {busy === "confirm" ? "Saving…" : "Yes, I'm open to it"}
        </button>
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void respond("decline")}
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-white/80 disabled:opacity-60"
        >
          {busy === "decline" ? "Saving…" : "Not right now"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </SectionCard>
  );
}
