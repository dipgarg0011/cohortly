"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { deadlineLabel, isDeadlineUrgent } from "@/lib/referrals";
import { getInitials, getProfileRole } from "@/lib/network";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { SurfaceCard } from "@/components/ui/surface-card";
import { AppModal } from "@/components/ui/app-modal";
import { IconOpportunityEmpty } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProfilePreviewTrigger } from "@/components/profile-preview";
import {
  ACTIVE_POSTING_CAP,
  APPLICATION_SELECT,
  APPLICATION_STATUS_LABEL,
  DESCRIPTION_MIN,
  OPPORTUNITY_SELECT,
  OPPORTUNITY_TYPES,
  PITCH_MAX,
  PITCH_MIN,
  TYPE_FILTERS,
  isApplicationChatUnlocked,
  isOpportunityActive,
  mapApplicationError,
  mapOpportunityPostError,
  normalizeApplication,
  normalizeOpportunity,
  sortOpportunities,
  type ApplicationStatus,
  type Opportunity,
  type OpportunityApplication,
  type OpportunityFilter,
  type OpportunityType,
} from "@/lib/opportunities";

type BoardView = "board" | "mine" | "applicants";

type Props = {
  currentUserId: string;
  initialOpportunities: Opportunity[];
  initialMyApplications: OpportunityApplication[];
  initialReceivedApplications: OpportunityApplication[];
};

export function OpportunitiesBoard({
  currentUserId,
  initialOpportunities,
  initialMyApplications,
  initialReceivedApplications,
}: Props) {
  const searchParams = useSearchParams();
  const [items, setItems] = useState(initialOpportunities);
  const [myApps, setMyApps] = useState(initialMyApplications);
  const [received, setReceived] = useState(initialReceivedApplications);
  const [filter, setFilter] = useState<OpportunityFilter>("all");
  const [view, setView] = useState<BoardView>("board");
  const [showForm, setShowForm] = useState(false);
  const [applyTarget, setApplyTarget] = useState<Opportunity | null>(null);
  const [highlightAppId, setHighlightAppId] = useState<string | null>(null);

  useEffect(() => {
    const nextView = searchParams.get("view");
    if (
      nextView === "board" ||
      nextView === "mine" ||
      nextView === "applicants"
    ) {
      setView(nextView);
    }
    const appId = searchParams.get("applicationId");
    setHighlightAppId(appId);
    if (appId) {
      // Default tab from application ownership when view omitted
      if (
        nextView !== "board" &&
        nextView !== "mine" &&
        nextView !== "applicants"
      ) {
        const inReceived = initialReceivedApplications.some((a) => a.id === appId);
        const inMine = initialMyApplications.some((a) => a.id === appId);
        if (inReceived) setView("applicants");
        else if (inMine) setView("mine");
      }
      window.setTimeout(() => {
        document
          .getElementById(`application-${appId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
    }
  }, [searchParams, initialMyApplications, initialReceivedApplications]);

  const myAppByOpportunity = useMemo(() => {
    const map = new Map<string, OpportunityApplication>();
    for (const app of myApps) {
      const existing = map.get(app.opportunity_id);
      if (!existing || existing.created_at < app.created_at) {
        map.set(app.opportunity_id, app);
      }
    }
    return map;
  }, [myApps]);

  const pendingReceivedCount = useMemo(
    () => received.filter((a) => a.status === "pending").length,
    [received],
  );

  const hasPosted = useMemo(
    () => items.some((item) => item.posted_by === currentUserId),
    [items, currentUserId],
  );

  const myActiveCount = useMemo(
    () =>
      items.filter(
        (item) =>
          item.posted_by === currentUserId &&
          isOpportunityActive(item.deadline),
      ).length,
    [items, currentUserId],
  );

  const filtered = useMemo(() => {
    const base =
      filter === "all" ? items : items.filter((item) => item.type === filter);
    return sortOpportunities(base);
  }, [items, filter]);

  return (
    <div className="space-y-6 min-w-0 overflow-x-clip">
      <div
        className="flex w-full min-w-0 flex-wrap gap-1 rounded-xl bg-teal-50 p-1"
        role="tablist"
        aria-label="Opportunities views"
      >
        {(
          [
            { id: "board" as const, label: "Board" },
            {
              id: "mine" as const,
              label: "My applications",
              count: myApps.length || undefined,
            },
            ...(hasPosted || received.length > 0
              ? [
                  {
                    id: "applicants" as const,
                    label: "Applicants",
                    count: pendingReceivedCount || undefined,
                  },
                ]
              : []),
          ] as { id: BoardView; label: string; count?: number }[]
        ).map((option) => {
          const active = view === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setView(option.id);
                // Don't leave the applicant-form helper modal open over Applicants
                if (option.id !== "board") setApplyTarget(null);
              }}
              className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-[11px] font-semibold transition sm:flex-none sm:px-3 sm:text-sm ${
                active
                  ? "bg-white text-teal-900 shadow-sm"
                  : "text-teal-700/70 hover:text-teal-900"
              }`}
            >
              <span className="truncate">{option.label}</span>
              {option.count != null && option.count > 0 && (
                <span
                  className={`ml-1 rounded-full px-1.5 text-[10px] ${
                    active ? "bg-teal-100 text-teal-800" : "bg-white text-teal-800"
                  }`}
                >
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {view === "board" && (
        <>
          <SectionCard>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div
                className="flex w-full min-w-0 flex-wrap gap-1 rounded-xl bg-slate-100 p-1"
                role="tablist"
                aria-label="Opportunity type"
              >
                {TYPE_FILTERS.map((option) => {
                  const active = filter === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setFilter(option.id)}
                      className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-[11px] font-semibold transition sm:flex-none sm:px-3 sm:text-sm ${
                        active
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <span className="truncate">{option.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex w-full shrink-0 flex-col items-stretch gap-1 sm:w-auto sm:items-end">
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="btn-primary w-full sm:w-auto"
                >
                  Post an Opportunity
                </button>
                <p className="text-xs text-slate-500 sm:text-right">
                  Anyone can post · Anyone can apply · {myActiveCount}/
                  {ACTIVE_POSTING_CAP} active
                </p>
              </div>
            </div>
          </SectionCard>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<IconOpportunityEmpty />}
              title="The board is wide open"
              description="Share an internship, job, research role, or early-stage startup opening — or browse and apply with a short pitch."
              actionLabel="Post an Opportunity"
              onAction={() => setShowForm(true)}
              accentSoft="var(--accent-opportunities-soft)"
            />
          ) : (
            <ul className="grid auto-rows-fr grid-cols-1 gap-4 lg:grid-cols-2">
              {filtered.map((item) => (
                <li key={item.id} className="flex min-w-0">
                  <OpportunityCard
                    opportunity={item}
                    currentUserId={currentUserId}
                    myApplication={myAppByOpportunity.get(item.id) ?? null}
                    onApply={() => setApplyTarget(item)}
                    onDeleted={(id) =>
                      setItems((prev) => prev.filter((o) => o.id !== id))
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {view === "mine" && (
        <MyApplicationsList
          applications={myApps}
          highlightAppId={highlightAppId}
          onWithdrawn={(id) =>
            setMyApps((prev) =>
              prev.map((a) =>
                a.id === id ? { ...a, status: "withdrawn" as const } : a,
              ),
            )
          }
        />
      )}

      {view === "applicants" && (
        <ApplicantsList
          applications={received}
          highlightAppId={highlightAppId}
          onUpdated={(updated) =>
            setReceived((prev) =>
              prev.map((a) => (a.id === updated.id ? updated : a)),
            )
          }
        />
      )}

      {showForm && (
        <AppModal
          open={showForm}
          onClose={() => setShowForm(false)}
          title="Post an opportunity"
          description="Share an internship, job, research role, or early-stage opening. Anyone in your college can post."
          maxWidthClass="sm:max-w-lg"
          scrollBody={false}
        >
          <OpportunityForm
            activeCount={myActiveCount}
            onCreated={(item) => {
              setItems((prev) => sortOpportunities([item, ...prev]));
              setShowForm(false);
              setFilter("all");
              setView("board");
            }}
            onCancel={() => setShowForm(false)}
          />
        </AppModal>
      )}

      {applyTarget && view === "board" && (
        <AppModal
          open={!!applyTarget}
          onClose={() => setApplyTarget(null)}
          title="Apply through Cohortly"
          description={
            applyTarget.company?.trim()
              ? `${applyTarget.title} · ${applyTarget.company.trim()}`
              : applyTarget.title
          }
          maxWidthClass="sm:max-w-lg"
          scrollBody={false}
        >
          <ApplyForm
            opportunity={applyTarget}
            onSubmitted={(app) => {
              setMyApps((prev) => [app, ...prev.filter((a) => a.id !== app.id)]);
              setApplyTarget(null);
              setView("mine");
            }}
            onCancel={() => setApplyTarget(null)}
          />
        </AppModal>
      )}
    </div>
  );
}

function OpportunityForm({
  activeCount,
  onCreated,
  onCancel,
}: {
  activeCount: number;
  onCreated: (item: Opportunity) => void;
  onCancel: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [type, setType] = useState<OpportunityType>("Internship");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");
  const [applyLink, setApplyLink] = useState("");
  const [contactMethod, setContactMethod] = useState("");
  const [location, setLocation] = useState("");
  const [deadline, setDeadline] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descLen = description.trim().length;
  const descOk = descLen >= DESCRIPTION_MIN;
  const atCap = activeCount >= ACTIVE_POSTING_CAP;
  const todayMin = localDateInputValue(new Date());

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    if (atCap) {
      setError(
        `You already have ${ACTIVE_POSTING_CAP} active opportunities. Delete one or wait for a deadline to pass.`,
      );
      setLoading(false);
      return;
    }

    if (!title.trim()) {
      setError("Title is required.");
      setLoading(false);
      return;
    }

    if (!descOk) {
      setError(`Description must be at least ${DESCRIPTION_MIN} characters.`);
      setLoading(false);
      return;
    }

    if (deadline && deadline < todayMin) {
      setError("Deadline can't be in the past.");
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

    const { data, error: insertError } = await supabase
      .from("opportunities")
      .insert({
        posted_by: user.id,
        type,
        title: title.trim(),
        company: company.trim() || null,
        description: description.trim(),
        apply_link: applyLink.trim() || null,
        contact_info: contactMethod.trim() || null,
        location: location.trim() || null,
        deadline: deadline || null,
      })
      .select(OPPORTUNITY_SELECT)
      .single();

    if (insertError) {
      setError(mapOpportunityPostError(insertError.message));
      setLoading(false);
      return;
    }

    onCreated(normalizeOpportunity(data as Record<string, unknown>));
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
        {atCap && (
          <p
            role="alert"
            className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            You&apos;ve hit the {ACTIVE_POSTING_CAP}-active limit. Delete an
            older posting or wait for a deadline to pass before posting again.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Type
            </span>
            <select
              required
              value={type}
              onChange={(e) => setType(e.target.value as OpportunityType)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            >
              {OPPORTUNITY_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Company
            </span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company or lab"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Title
            </span>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Software Engineering Intern"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Description
            </span>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="What the role involves, who it's for, and what you're looking for…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
            <span
              className={`mt-1 block text-right text-xs ${
                descOk ? "text-slate-500" : "text-amber-700"
              }`}
            >
              {descLen} chars
              {!descOk
                ? ` · ${DESCRIPTION_MIN - descLen} more needed`
                : ""}
            </span>
          </label>

          <div className="space-y-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium text-slate-700">
                How should people apply?
              </p>
              <p className="mt-1.5 rounded-xl bg-teal-50 px-3.5 py-3 text-sm text-teal-900">
                Through Cohortly — applicants send you a pitch and you decide who
                to talk to.
              </p>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Optional: external apply link
              </span>
              <input
                type="url"
                value={applyLink}
                onChange={(e) => setApplyLink(e.target.value)}
                placeholder="https://…"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Shown publicly on the opportunity card.
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Optional: other contact method
              </span>
              <input
                value={contactMethod}
                onChange={(e) => setContactMethod(e.target.value)}
                placeholder="Email, LinkedIn, or how to reach you"
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Not shown on the public card — shared only with applicants you
                move forward.
              </span>
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Location
            </span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Remote, Bengaluru…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Deadline
            </span>
            <input
              type="date"
              min={todayMin}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </label>
        </div>
      </div>

      <div className="shrink-0 space-y-3 border-t border-slate-100 bg-white px-4 py-3 sm:px-5">
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
            disabled={loading || atCap}
            className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-60"
          >
            {loading ? "Posting…" : "Post opportunity"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

function OpportunityCard({
  opportunity,
  currentUserId,
  myApplication,
  onApply,
  onDeleted,
}: {
  opportunity: Opportunity;
  currentUserId: string;
  myApplication: OpportunityApplication | null;
  onApply: () => void;
  onDeleted: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deadlineText = deadlineLabel(opportunity.deadline);
  const urgent = isDeadlineUrgent(opportunity.deadline);
  const isMine = opportunity.posted_by === currentUserId;
  const posterRole = getProfileRole(opportunity.poster?.status ?? null);

  async function handleDelete() {
    if (
      !window.confirm(
        "Delete this opportunity? Applicants will no longer see it on the board.",
      )
    ) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const { error } = await supabase
      .from("opportunities")
      .delete()
      .eq("id", opportunity.id)
      .eq("posted_by", currentUserId);
    if (error) {
      setDeleteError(error.message || "Couldn't delete this posting.");
      setDeleting(false);
      return;
    }
    onDeleted(opportunity.id);
    setDeleting(false);
  }

  return (
    <SurfaceCard as="article" interactive className="flex h-full min-w-0 w-full flex-col p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          {opportunity.company?.trim() ? (
            <p className="break-safe text-xs font-bold uppercase tracking-wide text-teal-800/80">
              {opportunity.company.trim()}
            </p>
          ) : (
            <p className="text-xs font-bold uppercase tracking-wide text-transparent select-none">
              —
            </p>
          )}
          <h3 className="card-title mt-1 break-safe">{opportunity.title}</h3>
        </div>
        <div className="flex max-w-[48%] shrink-0 flex-wrap items-start justify-end gap-1.5">
          {isMine && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900">
              Your posting
            </span>
          )}
          <span className="truncate rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800">
            {opportunity.type}
          </span>
        </div>
      </div>

      <p className="mt-3 line-clamp-3 min-h-[3.75rem] break-safe text-sm text-slate-600">
        {opportunity.description?.trim() || "No description provided."}
      </p>

      <div className="mt-4 flex min-h-[1.75rem] min-w-0 flex-wrap gap-2 text-xs">
        {opportunity.location?.trim() && (
          <span className="max-w-full break-safe rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
            {opportunity.location.trim()}
          </span>
        )}
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
      </div>

      {opportunity.poster?.full_name && (
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="min-w-0 truncate">
            Posted by{" "}
            <ProfilePreviewTrigger
              userId={opportunity.posted_by}
              className="font-semibold text-slate-600 hover:text-teal-800"
            >
              <span title={opportunity.poster.full_name}>
                {opportunity.poster.full_name}
              </span>
            </ProfilePreviewTrigger>
            {opportunity.poster.batch_year != null
              ? ` · Batch ${opportunity.poster.batch_year}`
              : ""}
          </span>
          <StatusBadge role={posterRole} />
        </div>
      )}

      {deleteError && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {deleteError}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-4 sm:flex-row sm:flex-wrap">
        {isMine ? (
          <button
            type="button"
            disabled={deleting}
            onClick={() => void handleDelete()}
            className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete posting"}
          </button>
        ) : myApplication ? (
          <span
            className={`inline-flex items-center rounded-xl px-3 py-2 text-sm font-semibold ${statusTone(myApplication.status)}`}
          >
            {myApplication.status === "pending"
              ? "Applied · Pending"
              : `Applied · ${APPLICATION_STATUS_LABEL[myApplication.status]}`}
          </span>
        ) : (
          <button type="button" onClick={onApply} className="btn-primary w-full sm:w-auto">
            Apply through Cohortly
          </button>
        )}

        {opportunity.apply_link ? (
          <a
            href={opportunity.apply_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
          >
            Apply on company site
          </a>
        ) : null}
      </div>
    </SurfaceCard>
  );
}

function ApplyForm({
  opportunity,
  onSubmitted,
  onCancel,
}: {
  opportunity: Opportunity;
  onSubmitted: (app: OpportunityApplication) => void;
  onCancel: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [pitch, setPitch] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [existingResume, setExistingResume] = useState<string | null>(null);
  const [useExisting, setUseExisting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: fromApps } = await supabase
        .from("opportunity_applications")
        .select("resume_url")
        .eq("applicant_id", user.id)
        .not("resume_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (fromApps?.resume_url) {
        setExistingResume(fromApps.resume_url as string);
        return;
      }

      const { data: fromReferrals } = await supabase
        .from("referral_requests")
        .select("resume_url")
        .eq("student_id", user.id)
        .not("resume_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cancelled && fromReferrals?.resume_url) {
        setExistingResume(fromReferrals.resume_url as string);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const pitchLen = pitch.length;
  const pitchOk = pitch.trim().length >= PITCH_MIN && pitchLen <= PITCH_MAX;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    if (!pitchOk) {
      setError(`Pitch must be ${PITCH_MIN}–${PITCH_MAX} characters.`);
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

    let resumePath: string | null = null;
    if (resumeFile) {
      if (resumeFile.size > 5 * 1024 * 1024) {
        setError("Resume must be under 5 MB.");
        setLoading(false);
        return;
      }
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
            ? "Resume storage isn’t set up yet. Ask an admin to run the resumes storage SQL."
            : `Resume upload failed: ${uploadError.message}`,
        );
        setLoading(false);
        return;
      }
      resumePath = path;
    } else if (useExisting && existingResume) {
      resumePath = existingResume;
    }

    const { data, error: insertError } = await supabase
      .from("opportunity_applications")
      .insert({
        opportunity_id: opportunity.id,
        applicant_id: user.id,
        pitch: pitch.trim(),
        resume_url: resumePath,
        status: "pending",
      })
      .select(
        `
        ${APPLICATION_SELECT},
        opportunity:opportunities (
          id, posted_by, type, title, company, description, apply_link, contact_info, location, deadline, created_at,
          poster:profiles!posted_by ( id, full_name, batch_year, status )
        )
      `,
      )
      .single();

    if (insertError) {
      console.error("opportunity_applications insert failed", insertError);
      setError(mapApplicationError(insertError.message));
      setLoading(false);
      return;
    }

    onSubmitted(normalizeApplication(data as Record<string, unknown>));
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
        <p className="rounded-xl bg-teal-50 px-3.5 py-3 text-sm text-teal-900">
          Your pitch becomes your first message. Chat unlocks when the poster
          reviews your application and messages you.
        </p>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Why you&apos;re a fit
          </span>
          <textarea
            required
            value={pitch}
            onChange={(e) => setPitch(e.target.value.slice(0, PITCH_MAX))}
            rows={6}
            placeholder="Skills, relevant projects, and why this role…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
          <span
            className={`mt-1 block text-right text-xs ${
              pitchOk ? "text-slate-500" : "text-amber-700"
            }`}
          >
            {pitchLen}/{PITCH_MAX}
            {pitch.trim().length < PITCH_MIN
              ? ` · ${PITCH_MIN - pitch.trim().length} more needed`
              : ""}
          </span>
        </label>

        <div className="space-y-2">
          <span className="block text-sm font-medium text-slate-700">
            Resume (optional)
          </span>
          {existingResume && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={useExisting && !resumeFile}
                onChange={(e) => {
                  setUseExisting(e.target.checked);
                  if (e.target.checked) setResumeFile(null);
                }}
                className="mt-0.5"
              />
              <span>Reuse my last uploaded resume</span>
            </label>
          )}
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setResumeFile(file);
              if (file) setUseExisting(false);
            }}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-700"
          />
        </div>
      </div>

      <div className="shrink-0 space-y-3 border-t border-slate-100 bg-white px-4 py-3 sm:px-5">
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
            disabled={loading || !pitchOk}
            className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-60"
          >
            {loading ? "Submitting…" : "Submit application"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

function MyApplicationsList({
  applications,
  highlightAppId = null,
  onWithdrawn,
}: {
  applications: OpportunityApplication[];
  highlightAppId?: string | null;
  onWithdrawn: (id: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function withdraw(id: string) {
    setBusyId(id);
    setError(null);
    const { data, error: updateError } = await supabase
      .from("opportunity_applications")
      .update({ status: "withdrawn" })
      .eq("id", id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (updateError) {
      setError(mapApplicationError(updateError.message));
      setBusyId(null);
      return;
    }
    if (!data) {
      setError("Could not withdraw — it may already be decided.");
      setBusyId(null);
      return;
    }
    onWithdrawn(id);
    setBusyId(null);
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        icon={<IconOpportunityEmpty />}
        title="No applications yet"
        description="Find a role on the board and apply through Cohortly with a short pitch."
        accentSoft="var(--accent-opportunities-soft)"
      />
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {applications.map((app) => {
          const title = app.opportunity?.title ?? "Opportunity";
          const company = app.opportunity?.company?.trim();
          const posterId = app.opportunity?.posted_by;
          return (
            <li key={app.id} id={`application-${app.id}`}>
              <SurfaceCard
                className={`p-4 sm:p-5 ${
                  highlightAppId === app.id
                    ? "ring-2 ring-teal-500 ring-offset-2"
                    : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    {company && (
                      <p className="text-xs font-bold uppercase tracking-wide text-teal-800/80">
                        {company}
                      </p>
                    )}
                    <h3 className="card-title mt-0.5 break-safe">{title}</h3>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(app.status)}`}
                  >
                    {APPLICATION_STATUS_LABEL[app.status]}
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 break-safe text-sm text-slate-600">
                  {app.pitch}
                </p>
                {app.status === "pending" ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Chat unlocks when the poster reviews your application.
                  </p>
                ) : null}
                {isApplicationChatUnlocked(app.status) &&
                  app.opportunity?.contact_info?.trim() && (
                    <p className="mt-3 break-safe rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <span className="font-semibold text-slate-800">
                        Contact from poster:{" "}
                      </span>
                      {app.opportunity.contact_info.trim()}
                    </p>
                  )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {isApplicationChatUnlocked(app.status) && posterId && (
                    <Link
                      href={`/messages?with=${posterId}`}
                      className="btn-primary"
                    >
                      Message
                    </Link>
                  )}
                  {app.status === "pending" && (
                    <button
                      type="button"
                      disabled={busyId === app.id}
                      onClick={() => void withdraw(app.id)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {busyId === app.id ? "Withdrawing…" : "Withdraw"}
                    </button>
                  )}
                </div>
              </SurfaceCard>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ApplicantsList({
  applications,
  highlightAppId = null,
  onUpdated,
}: {
  applications: OpportunityApplication[];
  highlightAppId?: string | null;
  onUpdated: (app: OpportunityApplication) => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openResume(path: string) {
    const { data, error: signedError } = await supabase.storage
      .from("resumes")
      .createSignedUrl(path, 60);
    if (signedError || !data?.signedUrl) {
      alert(signedError?.message || "Could not open resume.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function fetchApplication(id: string): Promise<OpportunityApplication | null> {
    const { data, error: fetchError } = await supabase
      .from("opportunity_applications")
      .select(
        `
        ${APPLICATION_SELECT},
        opportunity:opportunities (
          id, posted_by, type, title, company, description, apply_link, contact_info, location, deadline, created_at,
          poster:profiles!posted_by ( id, full_name, batch_year, status )
        ),
        applicant:profiles!applicant_id (
          id, full_name, batch_year, department, skills, avatar_url
        )
      `,
      )
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !data) return null;
    return normalizeApplication(data as Record<string, unknown>);
  }

  async function decide(
    app: OpportunityApplication,
    status: "reviewing" | "shortlisted" | "closed",
  ) {
    setBusyId(app.id);
    setError(null);

    if (status === "reviewing" && app.status !== "pending") {
      setError("This application was already decided.");
      setBusyId(null);
      return;
    }
    if (
      status === "shortlisted" &&
      app.status !== "reviewing" &&
      app.status !== "accepted"
    ) {
      setError("Only reviewing applications can be shortlisted.");
      setBusyId(null);
      return;
    }
    if (
      status === "closed" &&
      (app.status === "closed" || app.status === "declined" || app.status === "withdrawn")
    ) {
      setError("This application was already closed.");
      setBusyId(null);
      return;
    }

    const { data, error: rpcError } = await supabase.rpc(
      "decide_opportunity_application",
      {
        p_application_id: app.id,
        p_new_status: status,
        p_outcome: status === "closed" ? "not_selected" : null,
      },
    );

    // Always refresh from server so badge and actions agree
    const refreshed = await fetchApplication(app.id);
    if (refreshed) {
      onUpdated(refreshed);
    }

    if (rpcError) {
      const msg = rpcError.message || "";
      if (msg.includes("APPLICATION_ALREADY_DECIDED")) {
        setError("This application was already decided.");
      } else if (
        refreshed &&
        (refreshed.status === "reviewing" ||
          refreshed.status === "shortlisted" ||
          refreshed.status === "closed")
      ) {
        // Already moved — treat as ok for Move forward races
        if (status === "reviewing") {
          setBusyId(null);
          router.push(`/messages?with=${app.applicant_id}`);
          return;
        }
        setError("This application was already decided.");
      } else if (refreshed?.status === "pending") {
        setError(
          mapApplicationError(msg) === msg
            ? "Couldn't update this application. Please try again."
            : mapApplicationError(msg),
        );
      } else {
        setError(mapApplicationError(msg));
      }
      setBusyId(null);
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | Record<string, unknown>
      | null;

    if (!refreshed && !row) {
      setError("Couldn't confirm the decision. Please refresh and try again.");
      setBusyId(null);
      return;
    }

    if (!refreshed && row) {
      onUpdated(
        normalizeApplication({
          ...row,
          opportunity: app.opportunity,
          applicant: app.applicant,
        }),
      );
    }

    setBusyId(null);

    const finalStatus = refreshed?.status ?? status;
    if (finalStatus === "reviewing" || finalStatus === "shortlisted") {
      router.push(`/messages?with=${app.applicant_id}`);
    }
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        icon={<IconOpportunityEmpty />}
        title="No applicants yet"
        description="When someone applies to your posting, their pitch and resume show up here."
        accentSoft="var(--accent-opportunities-soft)"
      />
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {applications.map((app) => {
          const name = app.applicant?.full_name?.trim() || "Applicant";
          const title = app.opportunity?.title ?? "Your opportunity";
          return (
            <li key={app.id} id={`application-${app.id}`}>
              <SurfaceCard
                className={`p-4 sm:p-5 ${
                  highlightAppId === app.id
                    ? "ring-2 ring-teal-500 ring-offset-2"
                    : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <ProfilePreviewTrigger
                    userId={app.applicant_id}
                    className="shrink-0"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-100 text-sm font-bold text-teal-800">
                      {app.applicant?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={app.applicant.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        getInitials(name)
                      )}
                    </div>
                  </ProfilePreviewTrigger>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <ProfilePreviewTrigger userId={app.applicant_id}>
                          <h3 className="truncate font-semibold text-slate-900">
                            {name}
                          </h3>
                        </ProfilePreviewTrigger>
                        <p className="truncate text-xs text-slate-500">
                          {[
                            app.applicant?.batch_year != null
                              ? `Batch ${app.applicant.batch_year}`
                              : null,
                            app.applicant?.department,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                          {` → ${title}`}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(app.status)}`}
                      >
                        {APPLICATION_STATUS_LABEL[app.status]}
                      </span>
                    </div>

                    {app.applicant?.skills && app.applicant.skills.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {app.applicant.skills.slice(0, 5).map((skill) => (
                          <span
                            key={skill}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Pitch
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-safe text-sm text-slate-800">
                        {app.pitch?.trim() || "No pitch provided."}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {app.resume_url ? (
                        <button
                          type="button"
                          onClick={() => void openResume(app.resume_url!)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          View resume
                        </button>
                      ) : null}
                      {app.status === "pending" && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === app.id}
                            onClick={() => void decide(app, "reviewing")}
                            className="btn-primary disabled:opacity-60"
                          >
                            {busyId === app.id
                              ? "Opening…"
                              : "Review & message"}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === app.id}
                            onClick={() => void decide(app, "closed")}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Not a fit
                          </button>
                        </>
                      )}
                      {(app.status === "reviewing" ||
                        app.status === "accepted") && (
                        <>
                          <Link
                            href={`/messages?with=${app.applicant_id}`}
                            className="btn-primary"
                          >
                            Message
                          </Link>
                          <button
                            type="button"
                            disabled={busyId === app.id}
                            onClick={() => void decide(app, "shortlisted")}
                            className="btn-secondary disabled:opacity-60"
                          >
                            Shortlist
                          </button>
                          <button
                            type="button"
                            disabled={busyId === app.id}
                            onClick={() => void decide(app, "closed")}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Not a fit
                          </button>
                        </>
                      )}
                      {app.status === "shortlisted" && (
                        <>
                          <Link
                            href={`/messages?with=${app.applicant_id}`}
                            className="btn-primary"
                          >
                            Message
                          </Link>
                          <button
                            type="button"
                            disabled={busyId === app.id}
                            onClick={() => void decide(app, "closed")}
                            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Not a fit
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </SurfaceCard>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function statusTone(status: ApplicationStatus): string {
  switch (status) {
    case "pending":
      return "bg-amber-50 text-amber-900";
    case "reviewing":
    case "accepted":
      return "bg-sky-50 text-sky-800";
    case "shortlisted":
      return "bg-emerald-50 text-emerald-800";
    case "closed":
    case "declined":
      return "bg-slate-100 text-slate-600";
    case "withdrawn":
      return "bg-slate-100 text-slate-500";
  }
}

function localDateInputValue(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
