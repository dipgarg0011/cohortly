"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/network";
import { EmptyState } from "@/components/ui/empty-state";
import { SurfaceCard } from "@/components/ui/surface-card";
import { IconReferralEmpty } from "@/components/ui/icons";
import {
  deadlineLabel,
  isDeadlineUrgent,
  normalizeReferralRequest,
  type ReferralRequest,
  type ReferralStatus,
} from "@/lib/referrals";

type ViewMode = "need" | "help";
type NeedFilter = "open" | "matched" | "all";
type HelpFilter = "open" | "helping";

type Props = {
  currentUserId: string;
  initialRequests: ReferralRequest[];
};

export function ReferralBoard({ currentUserId, initialRequests }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState(initialRequests);
  const [view, setView] = useState<ViewMode>("need");
  const [needFilter, setNeedFilter] = useState<NeedFilter>("open");
  const [helpFilter, setHelpFilter] = useState<HelpFilter>("open");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const myRequests = useMemo(
    () => requests.filter((r) => r.student_id === currentUserId),
    [requests, currentUserId],
  );

  const helpOpen = useMemo(
    () =>
      requests.filter(
        (r) => r.status === "open" && r.student_id !== currentUserId,
      ),
    [requests, currentUserId],
  );

  const helping = useMemo(
    () => requests.filter((r) => r.accepted_by === currentUserId),
    [requests, currentUserId],
  );

  const needList = useMemo(() => {
    if (needFilter === "open") {
      return myRequests.filter((r) => r.status === "open");
    }
    if (needFilter === "matched") {
      return myRequests.filter((r) => r.status === "accepted");
    }
    return myRequests;
  }, [myRequests, needFilter]);

  const helpList = useMemo(() => {
    if (helpFilter === "helping") return helping;
    return helpOpen;
  }, [helpFilter, helpOpen, helping]);

  const needCounts = {
    open: myRequests.filter((r) => r.status === "open").length,
    matched: myRequests.filter((r) => r.status === "accepted").length,
    all: myRequests.length,
  };

  const helpCounts = {
    open: helpOpen.length,
    helping: helping.length,
  };

  async function handleAccept(request: ReferralRequest) {
    if (request.student_id === currentUserId || request.status !== "open") {
      return;
    }

    setBusyId(request.id);
    setError(null);

    const { data, error: updateError } = await supabase
      .from("referral_requests")
      .update({
        status: "accepted",
        accepted_by: currentUserId,
      })
      .eq("id", request.id)
      .eq("status", "open")
      .select(
        `
        id, student_id, company, role, resume_url, job_link, deadline, status, accepted_by, created_at,
        student:profiles!student_id ( id, full_name, batch_year, avatar_url ),
        acceptor:profiles!accepted_by ( id, full_name, batch_year, avatar_url )
      `,
      )
      .maybeSingle();

    if (updateError) {
      setError(updateError.message);
      setBusyId(null);
      return;
    }

    if (data) {
      setRequests((prev) =>
        prev.map((r) =>
          r.id === request.id
            ? normalizeReferralRequest(data as Record<string, unknown>)
            : r,
        ),
      );
      setHelpFilter("helping");
    }

    setBusyId(null);
    router.refresh();
  }

  function onCreated(request: ReferralRequest) {
    setRequests((prev) => [request, ...prev]);
    setShowForm(false);
    setView("need");
    setNeedFilter("open");
  }

  const list = view === "need" ? needList : helpList;

  return (
    <div className="space-y-6">
      {/* Two clear POVs */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ViewCard
          active={view === "need"}
          onClick={() => {
            setView("need");
            setShowForm(false);
          }}
          title="I need a referral"
          blurb="Post a request and track who accepts."
          countLabel={
            needCounts.open > 0
              ? `${needCounts.open} open`
              : needCounts.all > 0
                ? `${needCounts.all} total`
                : "No requests yet"
          }
        />
        <ViewCard
          active={view === "help"}
          onClick={() => {
            setView("help");
            setShowForm(false);
          }}
          title="I can help"
          blurb="Pick an open ask and refer someone."
          countLabel={
            helpCounts.open > 0
              ? `${helpCounts.open} waiting`
              : helpCounts.helping > 0
                ? `Helping ${helpCounts.helping}`
                : "None waiting"
          }
        />
      </div>

      {view === "need" ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FilterChips
            ariaLabel="My requests"
            options={[
              { id: "open", label: "Waiting", count: needCounts.open },
              { id: "matched", label: "Matched", count: needCounts.matched },
              { id: "all", label: "All mine", count: needCounts.all },
            ]}
            value={needFilter}
            onChange={setNeedFilter}
          />
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="btn-primary"
          >
            {showForm ? "Cancel" : "Ask for a referral"}
          </button>
        </div>
      ) : (
        <FilterChips
          ariaLabel="Help others"
          options={[
            { id: "open", label: "Needs help", count: helpCounts.open },
            { id: "helping", label: "I'm helping", count: helpCounts.helping },
          ]}
          value={helpFilter}
          onChange={setHelpFilter}
        />
      )}

      {showForm && view === "need" && (
        <ReferralRequestForm
          onCreated={onCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {list.length === 0 ? (
        view === "need" ? (
          <EmptyState
            icon={<IconReferralEmpty />}
            title={
              needFilter === "matched"
                ? "No matches yet"
                : "Ask for your first referral"
            }
            description={
              needFilter === "matched"
                ? "When someone accepts, they’ll show up here so you can message them."
                : "Share the company and role you’re targeting. Seniors who can help will see it."
            }
            actionLabel={
              needFilter === "open" || needFilter === "all"
                ? "Ask for a referral"
                : undefined
            }
            onAction={
              needFilter === "open" || needFilter === "all"
                ? () => setShowForm(true)
                : undefined
            }
            accentSoft="var(--accent-referrals-soft)"
          />
        ) : (
          <EmptyState
            icon={<IconReferralEmpty />}
            title={
              helpFilter === "helping"
                ? "You’re not helping anyone yet"
                : "No open asks right now"
            }
            description={
              helpFilter === "helping"
                ? "When you accept a request, it moves here so you can message the student."
                : "Check back later — or switch to “I need a referral” if you want help yourself."
            }
            accentSoft="var(--accent-referrals-soft)"
          />
        )
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {list.map((request) => (
            <li key={request.id}>
              <ReferralCard
                request={request}
                currentUserId={currentUserId}
                mode={view}
                busy={busyId === request.id}
                onAccept={() => handleAccept(request)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ViewCard({
  active,
  onClick,
  title,
  blurb,
  countLabel,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  blurb: string;
  countLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-5 py-4 text-left transition ${
        active
          ? "border-rose-300 bg-rose-50/80 shadow-sm ring-2 ring-rose-200/70"
          : "border-slate-200 bg-white/80 hover:border-rose-200 hover:bg-rose-50/40"
      }`}
    >
      <p className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-900">
        {title}
      </p>
      <p className="mt-1 text-sm text-slate-600">{blurb}</p>
      <p
        className={`mt-3 text-xs font-bold uppercase tracking-wide ${
          active ? "text-rose-700" : "text-slate-400"
        }`}
      >
        {countLabel}
      </p>
    </button>
  );
}

function FilterChips<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
}: {
  ariaLabel: string;
  options: { id: T; label: string; count: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
              active
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {option.label}
            <span
              className={`rounded-full px-1.5 text-[11px] ${
                active ? "bg-white/20 text-white" : "bg-white text-slate-500"
              }`}
            >
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ReferralRequestForm({
  onCreated,
  onCancel,
}: {
  onCreated: (request: ReferralRequest) => void;
  onCancel: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [jobLink, setJobLink] = useState("");
  const [deadline, setDeadline] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("You need to be logged in.");
      setLoading(false);
      return;
    }

    let resumeUrl: string | null = null;

    if (resumeFile) {
      const ext = resumeFile.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(path, resumeFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: resumeFile.type || "application/pdf",
        });

      if (uploadError) {
        const msg = uploadError.message.toLowerCase();
        setError(
          msg.includes("bucket") && msg.includes("not found")
            ? "Resume storage isn’t set up yet. Post without a resume for now, or ask an admin to run the resumes storage SQL in Supabase."
            : `Resume upload failed: ${uploadError.message}`,
        );
        setLoading(false);
        return;
      }

      resumeUrl = path;
    }

    const { data, error: insertError } = await supabase
      .from("referral_requests")
      .insert({
        student_id: user.id,
        company: company.trim(),
        role: role.trim(),
        job_link: jobLink.trim() || null,
        deadline: deadline || null,
        resume_url: resumeUrl,
        status: "open" satisfies ReferralStatus,
      })
      .select(
        `
        id, student_id, company, role, resume_url, job_link, deadline, status, accepted_by, created_at,
        student:profiles!student_id ( id, full_name, batch_year, avatar_url ),
        acceptor:profiles!accepted_by ( id, full_name, batch_year, avatar_url )
      `,
      )
      .single();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    onCreated(normalizeReferralRequest(data as Record<string, unknown>));
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="surface-card space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="card-title">What do you need referred for?</h2>
        <p className="mt-1 text-sm text-slate-500">
          Keep it short — company, role, and optional resume or job link.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Company"
          value={company}
          onChange={setCompany}
          placeholder="Google, Stripe…"
          required
        />
        <Field
          label="Role"
          value={role}
          onChange={setRole}
          placeholder="Software Engineer Intern"
          required
        />
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Job link{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input
            type="url"
            value={jobLink}
            onChange={(e) => setJobLink(e.target.value)}
            placeholder="https://…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Deadline{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Resume{" "}
            <span className="font-normal text-slate-400">
              (PDF/DOC, optional — max 5 MB)
            </span>
          </span>
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              if (file && file.size > 5 * 1024 * 1024) {
                setError("Resume must be under 5 MB.");
                e.target.value = "";
                setResumeFile(null);
                return;
              }
              setError(null);
              setResumeFile(file);
            }}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-rose-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-rose-800 hover:file:bg-rose-100"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            You can post without a resume and add it later when messaging.
          </p>
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={loading}
          className="btn-primary disabled:opacity-60"
        >
          {loading ? "Posting…" : "Post request"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <input
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
      />
    </label>
  );
}

function ReferralCard({
  request,
  currentUserId,
  mode,
  busy,
  onAccept,
}: {
  request: ReferralRequest;
  currentUserId: string;
  mode: ViewMode;
  busy: boolean;
  onAccept: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [resumeBusy, setResumeBusy] = useState(false);
  const isPoster = request.student_id === currentUserId;
  const isAcceptor = request.accepted_by === currentUserId;
  const canAccept = mode === "help" && request.status === "open" && !isPoster;
  const deadlineText = deadlineLabel(request.deadline);
  const urgent = isDeadlineUrgent(request.deadline);
  const studentName = request.student?.full_name?.trim() || "Student";
  const acceptorName = request.acceptor?.full_name?.trim() || "Someone";

  async function openResume() {
    if (!request.resume_url) return;
    setResumeBusy(true);
    const { data, error } = await supabase.storage
      .from("resumes")
      .createSignedUrl(request.resume_url, 60 * 10);
    setResumeBusy(false);
    if (error || !data?.signedUrl) {
      alert(error?.message || "Could not open resume.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <SurfaceCard as="article" interactive className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-rose-700/80">
            {request.company}
          </p>
          <h3 className="card-title mt-1 truncate">{request.role}</h3>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {mode === "help" && (
        <div className="mt-4 flex items-center gap-3">
          <Avatar
            name={request.student?.full_name ?? null}
            url={request.student?.avatar_url ?? null}
          />
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium text-slate-800">{studentName}</p>
            {request.student?.batch_year != null && (
              <p className="text-xs text-slate-500">
                Batch {request.student.batch_year}
              </p>
            )}
          </div>
        </div>
      )}

      {mode === "need" && request.status === "accepted" && (
        <div className="mt-4 flex items-center gap-3">
          <Avatar
            name={request.acceptor?.full_name ?? null}
            url={request.acceptor?.avatar_url ?? null}
          />
          <div className="min-w-0 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Referring you
            </p>
            <p className="truncate font-medium text-slate-800">{acceptorName}</p>
          </div>
        </div>
      )}

      {mode === "need" && request.status === "open" && (
        <p className="mt-4 text-sm text-slate-500">
          Waiting for someone to accept your request.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {deadlineText && (
          <span
            className={`rounded-full px-2.5 py-1 font-semibold ${
              urgent
                ? "bg-amber-50 text-amber-800"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {deadlineText}
          </span>
        )}
        {request.job_link && (
          <a
            href={request.job_link}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-rose-50 px-2.5 py-1 font-semibold text-rose-800 hover:bg-rose-100"
          >
            Job posting
          </a>
        )}
        {request.resume_url && (
          <button
            type="button"
            onClick={openResume}
            disabled={resumeBusy}
            className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60"
          >
            {resumeBusy ? "Opening…" : "View resume"}
          </button>
        )}
      </div>

      {mode === "help" && isAcceptor && (
        <div className="mt-4 rounded-xl bg-teal-50/80 px-3 py-2.5 text-sm text-teal-900">
          You accepted this — message them to coordinate the referral.
        </div>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {canAccept && (
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="btn-primary disabled:opacity-60"
          >
            {busy ? "Accepting…" : "I’ll refer them"}
          </button>
        )}

        {mode === "need" &&
          request.status === "accepted" &&
          request.accepted_by && (
            <Link
              href={`/messages?with=${request.accepted_by}`}
              className="btn-primary"
            >
              Message referrer
            </Link>
          )}

        {mode === "help" && isAcceptor && (
          <Link
            href={`/messages?with=${request.student_id}`}
            className="btn-primary"
          >
            Message student
          </Link>
        )}
      </div>
    </SurfaceCard>
  );
}

function StatusBadge({ status }: { status: ReferralStatus }) {
  const styles =
    status === "open"
      ? "bg-amber-50 text-amber-800"
      : status === "accepted"
        ? "bg-teal-50 text-teal-800"
        : "bg-slate-100 text-slate-600";

  const label =
    status === "open"
      ? "Waiting"
      : status === "accepted"
        ? "Matched"
        : "Closed";

  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${styles}`}
    >
      {label}
    </span>
  );
}

function Avatar({
  name,
  url,
}: {
  name: string | null;
  url: string | null;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-rose-100"
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-sm font-semibold text-rose-800"
    >
      {getInitials(name)}
    </div>
  );
}
