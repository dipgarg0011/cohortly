"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GRADUATE_COMPANY_TIP } from "@/lib/profile-completion";

const STORAGE_KEY = "cohortly:company-nudge-snooze";
/** Soft reminder cadence — hide after dismiss until this elapses. */
export const COMPANY_NUDGE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

type Props = {
  userId: string;
};

function storageKey(userId: string) {
  return `${STORAGE_KEY}:${userId}`;
}

function isSnoozed(userId: string): boolean {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    return Date.now() < until;
  } catch {
    return false;
  }
}

/**
 * Periodic dashboard nudge for graduates with empty `profiles.company`.
 * Dismissible; snoozes for {@link COMPANY_NUDGE_SNOOZE_MS} via localStorage.
 */
export function GraduateCompanyNudgeBanner({ userId }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isSnoozed(userId)) return;
    setVisible(true);
  }, [userId]);

  if (!visible) return null;

  function snooze() {
    try {
      window.localStorage.setItem(
        storageKey(userId),
        String(Date.now() + COMPANY_NUDGE_SNOOZE_MS),
      );
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  return (
    <div
      className="mb-4 flex min-w-0 flex-col gap-2 rounded-xl border border-teal-900/10 bg-teal-50/80 px-3 py-2.5 animate-fade-up sm:mb-6 sm:flex-row sm:items-center sm:gap-3"
      role="status"
    >
      <p className="min-w-0 flex-1 text-sm text-teal-950">{GRADUATE_COMPANY_TIP}</p>
      <div className="flex shrink-0 items-center gap-1 self-start sm:self-center">
        <Link
          href="/profile#company"
          className="rounded-lg px-2 py-1 text-sm font-bold text-[var(--brand)] hover:underline"
        >
          Add company →
        </Link>
        <button
          type="button"
          onClick={snooze}
          className="rounded-lg px-2 py-1 text-xs font-semibold text-teal-800/70 hover:bg-teal-100/80 hover:text-teal-950"
        >
          Remind me later
        </button>
        <button
          type="button"
          onClick={snooze}
          aria-label="Dismiss reminder"
          className="rounded-lg px-2 py-1 text-sm font-semibold leading-none text-teal-800/60 hover:bg-teal-100/80 hover:text-teal-950"
        >
          ×
        </button>
      </div>
    </div>
  );
}
