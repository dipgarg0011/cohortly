"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  blockReportedEmail,
  markReportReviewed,
  removeReportedUser,
} from "@/app/admin/moderation/actions";
import {
  reasonLabel,
  type AdminReportRow,
} from "@/lib/admin-moderation";
import { AppModal } from "@/components/ui/app-modal";
import { EmptyState } from "@/components/ui/empty-state";

type ConfirmKind = "block" | "remove" | "reviewed";

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AdminModerationConsole({
  reports,
  loadError,
  serviceConfigured,
}: {
  reports: AdminReportRow[];
  loadError: string | null;
  serviceConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: ConfirmKind;
    report: AdminReportRow;
  } | null>(null);

  function runAction() {
    if (!confirm) return;
    const { kind, report } = confirm;
    setError(null);
    startTransition(async () => {
      let result;
      if (kind === "block") {
        if (!report.reported_email) {
          setError("No email on file for the reported user.");
          return;
        }
        result = await blockReportedEmail({
          email: report.reported_email,
          reason: `Report ${report.id}: ${report.reason}`,
          reportId: report.id,
          targetUserId: report.reported_id,
        });
      } else if (kind === "remove") {
        result = await removeReportedUser({
          userId: report.reported_id,
          reason: `Report ${report.id}: ${report.reason}`,
          reportId: report.id,
        });
      } else {
        result = await markReportReviewed({ reportId: report.id });
      }

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirm(null);
      router.refresh();
    });
  }

  if (!serviceConfigured) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-4 text-sm text-amber-950">
        Set <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
        and <code className="font-mono text-xs">ADMIN_EMAILS</code> on the
        server (.env.local / Vercel). Never use a <code className="font-mono text-xs">NEXT_PUBLIC_</code>{" "}
        prefix for these.
      </div>
    );
  }

  if (reports.length === 0 && loadError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
        {loadError}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <EmptyState
        icon={<span className="text-2xl font-bold">✓</span>}
        title="No reports"
        description="User reports will show up here newest first. Private message bodies are never loaded in this console."
        accentSoft="var(--accent-profile-soft)"
      />
    );
  }

  return (
    <div className="space-y-4">
      {loadError ? (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          {loadError}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <ul className="space-y-4">
        {reports.map((report) => {
          const skills = (report.reported_skills ?? []).slice(0, 6);
          return (
            <li
              key={report.id}
              className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-4 sm:px-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {reasonLabel(report.reason)}
                    {report.reviewed_at ? (
                      <span className="ml-2 text-xs font-semibold text-emerald-700">
                        Reviewed
                      </span>
                    ) : (
                      <span className="ml-2 text-xs font-semibold text-amber-700">
                        Open
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatWhen(report.created_at)}
                  </p>
                </div>
              </div>

              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Reported
                  </dt>
                  <dd className="mt-0.5 font-medium text-slate-900">
                    {report.reported_name ?? "Unknown"}
                  </dd>
                  <dd className="text-xs text-slate-600">
                    {report.reported_email ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Reporter
                  </dt>
                  <dd className="mt-0.5 font-medium text-slate-900">
                    {report.reporter_name ?? "Unknown"}
                  </dd>
                  <dd className="text-xs text-slate-600">
                    {report.reporter_email ?? "—"}
                  </dd>
                </div>
              </dl>

              {report.details ? (
                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {report.details}
                </p>
              ) : null}

              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Profile: batch {report.reported_batch_year ?? "—"}
                {report.reported_department
                  ? ` · ${report.reported_department}`
                  : ""}
                {report.reported_status ? ` · ${report.reported_status}` : ""}
                {report.reported_role_title
                  ? ` · ${report.reported_role_title}`
                  : ""}
                {skills.length > 0 ? ` · ${skills.join(", ")}` : ""}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending || !report.reported_email}
                  onClick={() => {
                    setError(null);
                    setConfirm({ kind: "block", report });
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-45"
                >
                  Block email
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    setConfirm({ kind: "remove", report });
                  }}
                  className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-45"
                >
                  Remove account
                </button>
                {!report.reviewed_at ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setError(null);
                      setConfirm({ kind: "reviewed", report });
                    }}
                    className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-45"
                  >
                    Mark reviewed
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <AppModal
        open={Boolean(confirm)}
        onClose={() => {
          if (pending) return;
          setConfirm(null);
        }}
        title={
          confirm?.kind === "block"
            ? "Block this email?"
            : confirm?.kind === "remove"
              ? "Remove this account?"
              : "Mark report reviewed?"
        }
        description={
          confirm?.kind === "block"
            ? `They will not be able to sign up or log in with ${confirm.report.reported_email ?? "this email"}.`
            : confirm?.kind === "remove"
              ? `Permanently delete ${confirm.report.reported_name ?? "this user"} (${confirm.report.reported_email ?? "no email"}), block their email, and clean related rows. This cannot be undone.`
              : "Marks this report as reviewed. It stays in the list for audit."
        }
      >
        <div className="space-y-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => runAction()}
            className={
              confirm?.kind === "remove"
                ? "w-full rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-45"
                : "w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-45"
            }
          >
            {pending
              ? "Working…"
              : confirm?.kind === "block"
                ? "Yes, block email"
                : confirm?.kind === "remove"
                  ? "Yes, remove account"
                  : "Yes, mark reviewed"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirm(null)}
            className="w-full py-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      </AppModal>
    </div>
  );
}
