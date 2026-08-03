"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "cohortly:grad-nudge-dismissed";

type Props = {
  userId: string;
};

/** One-time dismissible banner when a "student" still has a passed batch year. */
export function GraduationNudgeBanner({ userId }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const key = `${STORAGE_KEY}:${userId}`;
      if (window.localStorage.getItem(key) === "1") return;
      setVisible(true);
    } catch {
      setVisible(true);
    }
  }, [userId]);

  if (!visible) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(`${STORAGE_KEY}:${userId}`, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  return (
    <div className="mb-4 flex min-w-0 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 animate-fade-up sm:mb-6">
      <p className="min-w-0 flex-1 text-sm text-amber-950">
        Have you graduated?{" "}
        <Link
          href="/profile"
          className="font-bold text-amber-900 underline underline-offset-2 hover:text-amber-950"
        >
          Update your profile
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-amber-800/80 hover:bg-amber-100 hover:text-amber-950"
      >
        Dismiss
      </button>
    </div>
  );
}
