"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  blockReportedEmail,
  loadRecentModerationMembers,
  markReportReviewed,
  removeReportedUser,
  searchModerationMembers,
  unblockEmail,
} from "@/app/admin/moderation/actions";
import {
  reasonLabel,
  type AdminMemberRow,
  type AdminReportRow,
  type BlockedEmailRow,
} from "@/lib/admin-moderation";
import { AppModal } from "@/components/ui/app-modal";
import { EmptyState } from "@/components/ui/empty-state";

type TabId = "reports" | "blocked" | "members";

type ConfirmState =
  | {
      kind: "block";
      email: string;
      userId?: string;
      reportId?: string;
      label: string;
      reason?: string;
    }
  | {
      kind: "remove";
      userId: string;
      email: string | null;
      label: string;
      reportId?: string;
      reason?: string;
    }
  | { kind: "reviewed"; reportId: string }
  | { kind: "unblock"; email: string };

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

const tabBtn =
  "min-w-0 flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition sm:px-3 sm:text-sm";

export function AdminModerationConsole({
  reports,
  blocked,
  recentMembers: initialRecentMembers,
  loadError,
  serviceConfigured,
}: {
  reports: AdminReportRow[];
  blocked: BlockedEmailRow[];
  recentMembers: AdminMemberRow[];
  loadError: string | null;
  serviceConfigured: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("reports");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  const [blockEmailInput, setBlockEmailInput] = useState("");
  const [blockReasonInput, setBlockReasonInput] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [members, setMembers] = useState<AdminMemberRow[]>([]);
  const [recentMembers, setRecentMembers] =
    useState<AdminMemberRow[]>(initialRecentMembers);
  const [memberSearched, setMemberSearched] = useState(false);

  useEffect(() => {
    setRecentMembers(initialRecentMembers);
  }, [initialRecentMembers]);

  function runConfirm() {
    if (!confirm) return;
    setError(null);
    startTransition(async () => {
      let result: { ok: true } | { ok: false; error: string };

      if (confirm.kind === "block") {
        result = await blockReportedEmail({
          email: confirm.email,
          reason:
            confirm.reason ||
            blockReasonInput.trim() ||
            undefined,
          reportId: confirm.reportId,
          targetUserId: confirm.userId,
        });
      } else if (confirm.kind === "remove") {
        result = await removeReportedUser({
          userId: confirm.userId,
          reason:
            confirm.reason || "Removed via admin member lookup",
          reportId: confirm.reportId,
        });
      } else if (confirm.kind === "reviewed") {
        result = await markReportReviewed({ reportId: confirm.reportId });
      } else {
        result = await unblockEmail({ email: confirm.email });
      }

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (confirm.kind === "block" && !confirm.reportId) {
        setBlockEmailInput("");
        setBlockReasonInput("");
      }
      setConfirm(null);
      router.refresh();
      if (memberSearched && memberQuery.trim().length >= 2) {
        const refreshed = await searchModerationMembers({
          query: memberQuery,
        });
        if (refreshed.ok) {
          setMembers(refreshed.members);
          if (refreshed.warning) setError(refreshed.warning);
        }
      } else {
        const recent = await loadRecentModerationMembers();
        if (recent.ok) setRecentMembers(recent.members);
      }
    });
  }

  function runMemberSearch() {
    setError(null);
    setMemberSearched(true);
    startTransition(async () => {
      const result = await searchModerationMembers({ query: memberQuery });
      if (!result.ok) {
        setMembers([]);
        setError(result.error);
        return;
      }
      setMembers(result.members);
      if (result.warning) setError(result.warning);
    });
  }

  if (!serviceConfigured) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-5 py-4 text-sm text-amber-950">
        Set <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
        and <code className="font-mono text-xs">ADMIN_EMAILS</code> on the
        server (.env.local / Vercel). Never use a{" "}
        <code className="font-mono text-xs">NEXT_PUBLIC_</code> prefix for
        these.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-slate-500">
          Admin
        </p>
        <div
          className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100/90 p-1"
          role="tablist"
          aria-label="Moderation sections"
        >
          {(
            [
              { id: "reports", label: "Reports", badge: reports.filter((r) => !r.reviewed_at).length },
              { id: "blocked", label: "Blocked", badge: blocked.length },
              { id: "members", label: "Members" },
            ] as const
          ).map((option) => {
            const active = tab === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setError(null);
                  setTab(option.id);
                }}
                className={`${tabBtn} ${
                  active
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {option.label}
                {"badge" in option && option.badge > 0 ? (
                  <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-amber-600 px-1.5 text-[10px] font-bold text-white">
                    {option.badge > 99 ? "99+" : option.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

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

      {tab === "reports" ? (
        <ReportsPanel
          reports={reports}
          pending={pending}
          onBlock={(report) => {
            if (!report.reported_email) {
              setError("No email on file for the reported user.");
              return;
            }
            setError(null);
            setConfirm({
              kind: "block",
              email: report.reported_email,
              userId: report.reported_id,
              reportId: report.id,
              label: report.reported_name ?? report.reported_email,
              reason: `Report ${report.id}: ${report.reason}`,
            });
          }}
          onRemove={(report) => {
            setError(null);
            setConfirm({
              kind: "remove",
              userId: report.reported_id,
              email: report.reported_email,
              label: report.reported_name ?? report.reported_email ?? "this user",
              reportId: report.id,
              reason: `Report ${report.id}: ${report.reason}`,
            });
          }}
          onReviewed={(report) => {
            setError(null);
            setConfirm({ kind: "reviewed", reportId: report.id });
          }}
        />
      ) : null}

      {tab === "blocked" ? (
        <BlockedPanel
          blocked={blocked}
          pending={pending}
          blockEmailInput={blockEmailInput}
          blockReasonInput={blockReasonInput}
          onEmailChange={setBlockEmailInput}
          onReasonChange={setBlockReasonInput}
          onAdd={() => {
            const email = blockEmailInput.trim();
            if (!email.includes("@")) {
              setError("Enter a valid email to block.");
              return;
            }
            setError(null);
            setConfirm({
              kind: "block",
              email,
              label: email,
            });
          }}
          onUnblock={(email) => {
            setError(null);
            setConfirm({ kind: "unblock", email });
          }}
        />
      ) : null}

      {tab === "members" ? (
        <MembersPanel
          query={memberQuery}
          onQueryChange={(value) => {
            setMemberQuery(value);
            if (memberSearched && value.trim().length < 2) {
              setMemberSearched(false);
              setMembers([]);
            }
          }}
          members={members}
          recentMembers={recentMembers}
          searched={memberSearched}
          pending={pending}
          onSearch={runMemberSearch}
          onBlock={(member) => {
            if (!member.email) {
              setError("No email on file for this member.");
              return;
            }
            setError(null);
            setConfirm({
              kind: "block",
              email: member.email,
              userId: member.id,
              label: member.full_name ?? member.email,
            });
          }}
          onRemove={(member) => {
            setError(null);
            setConfirm({
              kind: "remove",
              userId: member.id,
              email: member.email,
              label: member.full_name ?? member.email ?? "this member",
            });
          }}
        />
      ) : null}

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
              : confirm?.kind === "unblock"
                ? "Unblock this email?"
                : "Mark report reviewed?"
        }
        description={
          confirm?.kind === "block"
            ? `They will not be able to sign up or log in with ${confirm.email}.`
            : confirm?.kind === "remove"
              ? `Permanently delete ${confirm.label} (${confirm.email ?? "no email"}), block their email, and clean related rows. This cannot be undone.`
              : confirm?.kind === "unblock"
                ? `${confirm.email} will be able to sign up or log in again.`
                : "Marks this report as reviewed. It stays in the list for audit."
        }
      >
        <div className="space-y-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => runConfirm()}
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
                  : confirm?.kind === "unblock"
                    ? "Yes, unblock"
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

function ReportsPanel({
  reports,
  pending,
  onBlock,
  onRemove,
  onReviewed,
}: {
  reports: AdminReportRow[];
  pending: boolean;
  onBlock: (report: AdminReportRow) => void;
  onRemove: (report: AdminReportRow) => void;
  onReviewed: (report: AdminReportRow) => void;
}) {
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
                onClick={() => onBlock(report)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-45"
              >
                Block email
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onRemove(report)}
                className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-45"
              >
                Remove account
              </button>
              {!report.reviewed_at ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onReviewed(report)}
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
  );
}

function BlockedPanel({
  blocked,
  pending,
  blockEmailInput,
  blockReasonInput,
  onEmailChange,
  onReasonChange,
  onAdd,
  onUnblock,
}: {
  blocked: BlockedEmailRow[];
  pending: boolean;
  blockEmailInput: string;
  blockReasonInput: string;
  onEmailChange: (v: string) => void;
  onReasonChange: (v: string) => void;
  onAdd: () => void;
  onUnblock: (email: string) => void;
}) {
  return (
    <div className="space-y-4">
      <form
        className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-4 sm:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd();
        }}
      >
        <p className="text-sm font-bold text-slate-900">Block an email</p>
        <p className="mt-1 text-xs text-slate-500">
          Blocked addresses cannot sign up or log in.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            type="email"
            value={blockEmailInput}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="user@itbhu.ac.in"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
            required
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-45"
          >
            Block
          </button>
        </div>
        <input
          type="text"
          value={blockReasonInput}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Reason (optional)"
          className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
        />
      </form>

      {blocked.length === 0 ? (
        <EmptyState
          icon={<span className="text-2xl font-bold">∅</span>}
          title="No blocked emails"
          description="Blocked addresses will appear here. You can add one above or block from a report / member lookup."
          accentSoft="var(--accent-profile-soft)"
        />
      ) : (
        <ul className="space-y-3">
          {blocked.map((row) => (
            <li
              key={row.email}
              className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 sm:px-5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {row.email}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatWhen(row.created_at)}
                  {row.reason ? ` · ${row.reason}` : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => onUnblock(row.email)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-45"
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MemberList({
  members,
  pending,
  onBlock,
  onRemove,
}: {
  members: AdminMemberRow[];
  pending: boolean;
  onBlock: (member: AdminMemberRow) => void;
  onRemove: (member: AdminMemberRow) => void;
}) {
  return (
    <ul className="space-y-3">
      {members.map((member) => {
        const skills = (member.skills ?? []).slice(0, 6);
        return (
          <li
            key={member.id}
            className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-4 sm:px-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {member.full_name ?? "Unknown"}
                  {member.is_blocked ? (
                    <span className="ml-2 text-xs font-semibold text-red-700">
                      Blocked
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {member.email ?? "No email on file"}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Batch {member.batch_year ?? "—"}
              {member.department ? ` · ${member.department}` : ""}
              {member.status ? ` · ${member.status}` : ""}
              {member.role_title ? ` · ${member.role_title}` : ""}
              {member.company ? ` · ${member.company}` : ""}
              {skills.length > 0 ? ` · ${skills.join(", ")}` : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending || !member.email || member.is_blocked}
                onClick={() => onBlock(member)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-45"
              >
                Block email
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onRemove(member)}
                className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-45"
              >
                Remove account
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function MembersPanel({
  query,
  onQueryChange,
  members,
  recentMembers,
  searched,
  pending,
  onSearch,
  onBlock,
  onRemove,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  members: AdminMemberRow[];
  recentMembers: AdminMemberRow[];
  searched: boolean;
  pending: boolean;
  onSearch: () => void;
  onBlock: (member: AdminMemberRow) => void;
  onRemove: (member: AdminMemberRow) => void;
}) {
  return (
    <div className="space-y-4">
      <form
        className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-4 sm:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
      >
        <p className="text-sm font-bold text-slate-900">Member lookup</p>
        <p className="mt-1 text-xs text-slate-500">
          Search by name or email. Profile summary only — no private messages.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Name or email…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
            minLength={2}
            required
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-45"
          >
            {pending ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      {searched ? (
        members.length === 0 ? (
          <EmptyState
            icon={<span className="text-2xl font-bold">∅</span>}
            title="No matches"
            description="Try another name spelling or the full college email address."
            accentSoft="var(--accent-profile-soft)"
          />
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Search results
            </p>
            <MemberList
              members={members}
              pending={pending}
              onBlock={onBlock}
              onRemove={onRemove}
            />
          </div>
        )
      ) : recentMembers.length === 0 ? (
        <EmptyState
          icon={<span className="text-2xl font-bold">⌕</span>}
          title="Search members"
          description="Enter a name or email above to see a profile summary and take action."
          accentSoft="var(--accent-profile-soft)"
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recent members
          </p>
          <p className="text-xs text-slate-500">
            Last {recentMembers.length} signups. Search above to find someone
            specific.
          </p>
          <MemberList
            members={recentMembers}
            pending={pending}
            onBlock={onBlock}
            onRemove={onRemove}
          />
        </div>
      )}
    </div>
  );
}
