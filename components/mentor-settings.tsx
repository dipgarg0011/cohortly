"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SKILL_OPTIONS } from "@/lib/network";
import {
  type MentorAvailability,
  type MentorOnboardingState,
} from "@/lib/mentorship";

type Props = {
  isGraduate: boolean;
  initialAvailability: Pick<
    MentorAvailability,
    | "is_available"
    | "is_paused"
    | "onboarding_state"
    | "max_open_requests"
    | "topics"
    | "bio_note"
  > | null;
  profileSkills: string[];
};

const STUDENT_BLOCK =
  "Mentoring is for graduates. Update your status if you've graduated.";

export function MentorSettings({
  isGraduate,
  initialAvailability,
  profileSkills,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [isAvailable, setIsAvailable] = useState(
    initialAvailability?.is_available ?? false,
  );
  const [isPaused, setIsPaused] = useState(
    initialAvailability?.is_paused ?? false,
  );
  const [onboardingState, setOnboardingState] = useState<MentorOnboardingState>(
    initialAvailability?.onboarding_state ?? "not_asked",
  );
  const [maxOpen, setMaxOpen] = useState(
    String(initialAvailability?.max_open_requests ?? 5),
  );
  const [topics, setTopics] = useState<string[]>(
    initialAvailability?.topics?.length
      ? initialAvailability.topics
      : profileSkills,
  );
  const [bioNote, setBioNote] = useState(
    initialAvailability?.bio_note ?? "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isGraduate) {
    return (
      <section className="surface-card border-amber-200 bg-amber-50 p-5 sm:p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-amber-900/80">
          Mentoring
        </h2>
        <p className="mt-3 text-sm text-amber-950">{STUDENT_BLOCK}</p>
      </section>
    );
  }

  function toggleTopic(tag: string) {
    setTopics((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const max = Number(maxOpen);
    if (!Number.isInteger(max) || max < 1 || max > 20) {
      setError("Max open requests should be between 1 and 20.");
      setLoading(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be logged in.");
      setLoading(false);
      return;
    }

    // Turning availability on after decline/not_asked implies confirmation.
    const nextOnboarding: MentorOnboardingState =
      isAvailable || onboardingState === "confirmed"
        ? "confirmed"
        : onboardingState === "declined"
          ? "declined"
          : "not_asked";

    const { error: upsertError } = await supabase
      .from("mentor_availability")
      .upsert(
        {
          mentor_id: user.id,
          is_available: isAvailable,
          is_paused: isPaused,
          onboarding_state: nextOnboarding,
          max_open_requests: max,
          topics,
          bio_note: bioNote.trim() || null,
          session_lengths: [30, 60],
        },
        { onConflict: "mentor_id" },
      );

    if (upsertError) {
      setError(
        upsertError.message.includes("MENTOR_AVAILABLE_REQUIRES_CONFIRMED")
          ? "Confirm mentoring before turning availability on."
          : upsertError.message.includes("row-level security")
            ? "Couldn't save mentor settings. Make sure you're marked as a graduate."
            : upsertError.message || "Couldn't save mentor settings.",
      );
      setLoading(false);
      return;
    }

    setOnboardingState(nextOnboarding);
    setSuccess("Mentor settings saved.");
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <section className="surface-card p-5 sm:p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-teal-800/80">
          Mentoring
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Students can ask graduates for help. You choose what to answer and can
          pause anytime.
        </p>

        <div className="mt-4 space-y-4">
          <ToggleRow
            label="Available for new asks"
            description="When on, matching can send you new mentorship requests."
            checked={isAvailable}
            onChange={(next) => {
              setIsAvailable(next);
              if (next) setIsPaused(false);
            }}
          />
          <ToggleRow
            label="Pause matching"
            description="Temporarily stop new asks without turning availability off."
            checked={isPaused}
            onChange={setIsPaused}
            disabled={!isAvailable}
          />

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Max open requests
            </span>
            <input
              type="number"
              min={1}
              max={20}
              value={maxOpen}
              onChange={(e) => setMaxOpen(e.target.value)}
              className="w-full max-w-[8rem] rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Topics you can help with
            </span>
            <div className="mt-2 flex flex-wrap gap-2">
              {SKILL_OPTIONS.map((tag) => {
                const active = topics.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTopic(tag)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? "bg-teal-100 text-teal-900 ring-1 ring-teal-300"
                        : "bg-slate-100 text-slate-700 hover:bg-teal-50 hover:text-teal-900"
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Note for students
            </span>
            <textarea
              value={bioNote}
              onChange={(e) => setBioNote(e.target.value)}
              rows={3}
              placeholder="e.g. Happy to help with SDE interviews and resume reviews."
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </label>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}
        {success ? (
          <p
            role="status"
            className="mt-4 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800"
          >
            {success}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary mt-4 disabled:opacity-60"
        >
          {loading ? "Saving…" : "Save mentor settings"}
        </button>
      </section>
    </form>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition ${
          checked ? "bg-teal-700" : "bg-slate-300"
        } disabled:opacity-50`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
            checked ? "left-7" : "left-1"
          }`}
        />
        <span className="sr-only">{label}</span>
      </button>
    </div>
  );
}
