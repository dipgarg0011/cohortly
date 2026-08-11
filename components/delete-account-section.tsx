"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppModal } from "@/components/ui/app-modal";
import { createClient } from "@/lib/supabase/client";

const CONFIRM_PHRASE = "DELETE";

/**
 * Profile → Delete my account. Requires SQL:
 * supabase/migrations/20260811_delete_own_account.sql
 */
export function DeleteAccountSection() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (confirm.trim().toUpperCase() !== CONFIRM_PHRASE) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("delete_own_account");
    if (rpcError) {
      const msg = rpcError.message ?? "";
      setError(
        msg.includes("Could not find the function") ||
          msg.includes("schema cache")
          ? "Account deletion isn’t set up on the server yet. Ask an admin to run 20260811_delete_own_account.sql, or email cohortly.in@gmail.com."
          : msg || "Couldn’t delete your account. Try again or email cohortly.in@gmail.com.",
      );
      setBusy(false);
      return;
    }
    await supabase.auth.signOut();
    router.replace("/auth");
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-red-200/80 bg-red-50/40 px-5 py-5 sm:px-6">
      <h2 className="text-sm font-bold text-red-900">Delete my account</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
        Permanently remove your Cohortly account, profile, and messages you own.
        This can’t be undone. For help, email{" "}
        <a
          href="mailto:cohortly.in@gmail.com?subject=Delete%20my%20account"
          className="font-semibold text-[var(--brand)] hover:underline"
        >
          cohortly.in@gmail.com
        </a>
        .
      </p>
      <button
        type="button"
        onClick={() => {
          setConfirm("");
          setError(null);
          setOpen(true);
        }}
        className="mt-4 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
      >
        Delete my account
      </button>

      <AppModal
        open={open}
        onClose={() => {
          if (busy) return;
          setOpen(false);
        }}
        title="Delete your account?"
        description="This permanently deletes your login and personal data from Cohortly. Type DELETE to confirm."
      >
        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
          >
            {error}
          </p>
        ) : null}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Type DELETE to confirm
          </span>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20"
            placeholder="DELETE"
          />
        </label>
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={busy || confirm.trim().toUpperCase() !== CONFIRM_PHRASE}
            onClick={() => void onDelete()}
            className="w-full rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-800 disabled:opacity-45"
          >
            {busy ? "Deleting…" : "Permanently delete account"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen(false)}
            className="w-full py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      </AppModal>
    </section>
  );
}
