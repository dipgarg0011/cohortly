"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/network";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { SurfaceCard } from "@/components/ui/surface-card";
import { AppModal } from "@/components/ui/app-modal";
import { IconReferralEmpty } from "@/components/ui/icons";
import { ProfilePreviewTrigger } from "@/components/profile-preview";
import {
  REFERRAL_SELECT,
  deadlineLabel,
  isDeadlineUrgent,
  mapReferralError,
  needsReferralFollowup,
  normalizeReferralRequest,
  postingExpectation,
  reachLabel,
  type ReferralReachStats,
  type ReferralRequest,
  type ReferralStatus,
} from "@/lib/referrals";

type ViewMode = "need" | "help";
type NeedFilter = "open" | "matched" | "all";
type HelpFilter = "open" | "helping";

type Props = {
  currentUserId: string;
  isGraduate: boolean;
  viewerCompany: string | null;
  initialRequests: ReferralRequest[];
  knownCompanies: string[];
  reachById: Record<string, ReferralReachStats>;
  dismissedIds: string[];
};

export function ReferralBoard({
  currentUserId,
  isGraduate,
  viewerCompany,
  initialRequests,
  knownCompanies,
  reachById: initialReach,
  dismissedIds: initialDismissed,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState(initialRequests);
  const [reachById, setReachById] = useState(initialReach);
  const [dismissed, setDismissed] = useState(() => new Set(initialDismissed));
  const [view, setView] = useState<ViewMode>(isGraduate ? "help" : "need");
  const [needFilter, setNeedFilter] = useState<NeedFilter>("open");
  const [helpFilter, setHelpFilter] = useState<HelpFilter>("open");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [askTarget, setAskTarget] = useState<ReferralRequest | null>(null);
  const [acceptTarget, setAcceptTarget] = useState<ReferralRequest | null>(null);
  const [followupDismissed, setFollowupDismissed] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(
        `cohortly:referral-followup:${currentUserId}`,
      );
      if (raw) setFollowupDismissed(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, [currentUserId]);

  // Record views for help cards (Seen by X)
  useEffect(() => {
    const openOthers = requests.filter(
      (r) => r.status === "open" && r.student_id !== currentUserId,
    );
    if (openOthers.length === 0) return;
    void Promise.all(
      openOthers.map((r) =>
        supabase.from("referral_views").upsert(
          { request_id: r.id, viewer_id: currentUserId },
          { onConflict: "request_id,viewer_id" },
        ),
      ),
    );
  }, [requests, currentUserId, supabase]);

  const myRequests = useMemo(
    () => requests.filter((r) => r.student_id === currentUserId),
    [requests, currentUserId],
  );

  const myOpen = useMemo(
    () => myRequests.filter((r) => r.status === "open"),
    [myRequests],
  );
  const myMatched = useMemo(
    () => myRequests.filter((r) => r.status === "accepted"),
    [myRequests],
  );

  const helpOpen = useMemo(
    () =>
      requests.filter(
        (r) =>
          r.status === "open" &&
          r.student_id !== currentUserId &&
          !dismissed.has(r.id),
      ),
    [requests, currentUserId, dismissed],
  );

  const helping = useMemo(
    () => requests.filter((r) => r.accepted_by === currentUserId),
    [requests, currentUserId],
  );

  const needList = useMemo(() => {
    if (needFilter === "open") return myOpen;
    if (needFilter === "matched") return myMatched;
    return myRequests;
  }, [myOpen, myMatched, myRequests, needFilter]);

  const helpList = useMemo(() => {
    if (helpFilter === "helping") return helping;
    return helpOpen;
  }, [helpFilter, helpOpen, helping]);

  const needCounts = {
    open: myOpen.length,
    matched: myMatched.length,
    all: myRequests.length,
  };

  const helpCounts = {
    open: helpOpen.length,
    helping: helping.length,
  };

  const followups = useMemo(
    () =>
      helping.filter(
        (r) =>
          needsReferralFollowup(r, currentUserId) &&
          !followupDismissed.has(r.id),
      ),
    [helping, currentUserId, followupDismissed],
  );

  function patchRequest(id: string, row: Record<string, unknown>) {
    const next = normalizeReferralRequest(row);
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        return { ...next, student: next.student ?? r.student };
      }),
    );
  }

  function patchRequestFields(
    id: string,
    fields: Partial<ReferralRequest>,
  ) {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...fields } : r)),
    );
  }

  async function refreshReach(id: string) {
    const { data } = await supabase.rpc("referral_reach_stats", {
      p_request_id: id,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return;
    setReachById((prev) => ({
      ...prev,
      [id]: {
        tier: Number(row.tier ?? 1),
        opens_to_all_at: (row.opens_to_all_at as string | null) ?? null,
        matching_graduate_count: Number(row.matching_graduate_count ?? 0),
        past_company_graduate_count: Number(
          row.past_company_graduate_count ?? 0,
        ),
        age_tier: row.age_tier != null ? Number(row.age_tier) : undefined,
        open_to_all_now:
          row.open_to_all_now != null ? Boolean(row.open_to_all_now) : undefined,
      },
    }));
  }

  async function handleAccept(request: ReferralRequest) {
    setBusyId(request.id);
    setError(null);

    // Optimistic: show referring state immediately
    patchRequestFields(request.id, {
      status: "accepted",
      accepted_by: currentUserId,
    });

    const { data, error: rpcError } = await supabase.rpc(
      "accept_referral_request",
      { p_request_id: request.id },
    );

    if (rpcError) {
      console.error("accept_referral_request failed", rpcError);
      // Roll back optimistic patch
      patchRequestFields(request.id, {
        status: request.status,
        accepted_by: request.accepted_by,
      });
      setError(mapReferralError(rpcError.message));
      setBusyId(null);
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as
      | Record<string, unknown>
      | null;

    if (!row) {
      patchRequestFields(request.id, {
        status: request.status,
        accepted_by: request.accepted_by,
      });
      setError(
        "Someone else has already taken this — or the accept didn't go through. Refresh and try another ask.",
      );
      setBusyId(null);
      return;
    }

    const normalized = normalizeReferralRequest(row);
    normalized.student = request.student ?? normalized.student;
    patchRequest(request.id, row);
    setHelpFilter("helping");
    setAcceptTarget(normalized);
    setBusyId(null);
    router.refresh();
  }

  async function handleAsk(request: ReferralRequest, content: string) {
    setBusyId(request.id);
    setError(null);

    const trimmed = content.trim();
    const { error: insertError } = await supabase
      .from("referral_questions")
      .insert({
        request_id: request.id,
        asker_id: currentUserId,
        content: trimmed,
      });

    if (insertError) {
      console.error("referral_questions insert failed", insertError);
      setError(mapReferralError(insertError.message));
      setBusyId(null);
      return;
    }

    // Seed the question into the unlocked chat so the thread isn't empty.
    await supabase.from("messages").insert({
      sender_id: currentUserId,
      receiver_id: request.student_id,
      content: trimmed,
      read: false,
    });

    setAskTarget(null);
    setBusyId(null);
    router.push(`/messages?with=${request.student_id}`);
    router.refresh();
  }

  async function handleDismiss(request: ReferralRequest) {
    setBusyId(request.id);
    setError(null);
    const { error: dismissError } = await supabase
      .from("referral_dismissals")
      .upsert(
        { request_id: request.id, user_id: currentUserId },
        { onConflict: "request_id,user_id" },
      );
    if (dismissError) {
      setError(dismissError.message);
      setBusyId(null);
      return;
    }
    setDismissed((prev) => new Set(prev).add(request.id));
    setBusyId(null);
  }

  async function handleClose(request: ReferralRequest) {
    setBusyId(request.id);
    setError(null);
    const { data, error: updateError } = await supabase
      .from("referral_requests")
      .update({ status: "closed" })
      .eq("id", request.id)
      .eq("student_id", currentUserId)
      .select(REFERRAL_SELECT)
      .maybeSingle();
    if (updateError) {
      setError(mapReferralError(updateError.message));
      setBusyId(null);
      return;
    }
    if (!data) {
      setError(
        "Couldn't update that request. It may already be closed or taken — refresh and try again.",
      );
      setBusyId(null);
      return;
    }
    patchRequest(request.id, data as Record<string, unknown>);
    setBusyId(null);
  }

  async function handleMarkReferred(request: ReferralRequest) {
    setBusyId(request.id);
    setError(null);
    const { data, error: updateError } = await supabase
      .from("referral_requests")
      .update({ referred_at: new Date().toISOString() })
      .eq("id", request.id)
      .select(REFERRAL_SELECT)
      .maybeSingle();
    if (updateError) {
      setError(mapReferralError(updateError.message));
      setBusyId(null);
      return;
    }
    if (!data) {
      setError(
        "Couldn't mark as referred. Refresh and try again.",
      );
      setBusyId(null);
      return;
    }
    patchRequest(request.id, data as Record<string, unknown>);
    setBusyId(null);
  }

  function dismissFollowup(id: string) {
    setFollowupDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        window.localStorage.setItem(
          `cohortly:referral-followup:${currentUserId}`,
          JSON.stringify([...next]),
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function onCreated(request: ReferralRequest) {
    setRequests((prev) => [request, ...prev]);
    setShowForm(false);
    setView("need");
    setNeedFilter("open");
    void refreshReach(request.id);
  }

  const list = view === "need" ? needList : helpList;

  return (
    <div className="space-y-6 min-w-0 overflow-x-clip">
      {followups.length > 0 && (
        <div className="space-y-2">
          {followups.map((r) => (
            <div
              key={r.id}
              className="flex min-w-0 flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 sm:flex-row sm:items-center"
            >
              <p className="min-w-0 flex-1 text-sm text-rose-950">
                Did you manage to refer{" "}
                <ProfilePreviewTrigger
                  userId={r.student_id}
                  className="font-bold"
                >
                  {r.student?.full_name?.trim() || "them"}
                </ProfilePreviewTrigger>
                ?
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => {
                    void handleMarkReferred(r);
                    dismissFollowup(r.id);
                  }}
                  className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white"
                >
                  Yes, referred
                </button>
                <button
                  type="button"
                  onClick={() => dismissFollowup(r.id)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                >
                  Not yet
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
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
              ? `${needCounts.open} of yours waiting`
              : needCounts.all > 0
                ? `${needCounts.all} of yours total`
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
              ? `${helpCounts.open} need help`
              : helpCounts.helping > 0
                ? `Helping ${helpCounts.helping}`
                : "None need help"
          }
        />
      </div>

      {view === "help" && !isGraduate && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
          Open asks from others are shown to{" "}
          <span className="font-bold">graduates</span> only. You can still post
          and track your own requests under “I need a referral”. Update your
          status on{" "}
          <Link href="/profile" className="font-bold underline">
            Profile
          </Link>{" "}
          if you’ve graduated.
        </div>
      )}

      {view === "help" && isGraduate && !viewerCompany?.trim() && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-950">
          Add your current company on{" "}
          <Link href="/profile" className="font-bold underline">
            Profile
          </Link>{" "}
          so new asks for your workplace show up in the first 48 hours. Without
          it, you’ll only see asks after they widen (past companies at 48h, all
          graduates after 5 days).
        </div>
      )}

      {view === "need" ? (
        <SectionCard>
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
              className="btn-primary w-full sm:w-auto"
            >
              {showForm ? "Cancel" : "Ask for a referral"}
            </button>
          </div>
        </SectionCard>
      ) : (
        <SectionCard>
          <FilterChips
            ariaLabel="Help others"
            options={[
              { id: "open", label: "Needs help", count: helpCounts.open },
              { id: "helping", label: "I'm helping", count: helpCounts.helping },
            ]}
            value={helpFilter}
            onChange={setHelpFilter}
          />
        </SectionCard>
      )}

      {showForm && view === "need" && (
        <AppModal
          open={showForm}
          onClose={() => setShowForm(false)}
          title="What do you need referred for?"
          description="Company, role, why you’re a fit, and your resume."
          maxWidthClass="sm:max-w-lg"
        >
          <ReferralRequestForm
            knownCompanies={knownCompanies}
            openCount={myOpen.length}
            onCreated={onCreated}
            onCancel={() => setShowForm(false)}
          />
        </AppModal>
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
                : "Share the company, role, and why you’re a fit. Graduates who can help will see it."
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
                : !isGraduate
                  ? "Graduate view only"
                  : viewerCompany?.trim()
                    ? `No asks for ${viewerCompany.trim()} right now`
                    : "No open asks for you yet"
            }
            description={
              helpFilter === "helping"
                ? "When you accept a request, it moves here so you can message the student."
                : !isGraduate
                  ? "Switch to “I need a referral” to post, or mark yourself as a graduate on Profile to help others."
                  : viewerCompany?.trim()
                    ? "Nothing matching your company in the first 48 hours. After 48h, asks matching your past companies appear; after 5 days, all open asks are visible to graduates."
                    : "Add your company on Profile to see matching asks in the first 48 hours. Broader asks appear after 48h (past companies) and 5 days (all graduates)."
            }
            accentSoft="var(--accent-referrals-soft)"
          />
        )
      ) : (
        <ul className="grid grid-cols-1 gap-4">
          {list.map((request) => (
            <li key={request.id} className="min-w-0">
              <ReferralCard
                request={request}
                currentUserId={currentUserId}
                mode={view}
                busy={busyId === request.id}
                reach={reachById[request.id] ?? null}
                onAsk={() => setAskTarget(request)}
                onAccept={() => void handleAccept(request)}
                onDismiss={() => void handleDismiss(request)}
                onClose={() => void handleClose(request)}
                onMarkReferred={() => void handleMarkReferred(request)}
              />
            </li>
          ))}
        </ul>
      )}

      {askTarget && (
        <AskQuestionModal
          request={askTarget}
          busy={busyId === askTarget.id}
          onClose={() => setAskTarget(null)}
          onSend={(content) => void handleAsk(askTarget, content)}
        />
      )}

      {acceptTarget && (
        <AcceptChecklistModal
          request={acceptTarget}
          onClose={() => {
            const id = acceptTarget.student_id;
            setAcceptTarget(null);
            router.push(`/messages?with=${id}`);
          }}
        />
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
      className={`rounded-2xl border px-4 py-4 text-left transition sm:px-5 ${
        active
          ? "border-rose-300 bg-rose-50/80 shadow-sm ring-2 ring-rose-200/70"
          : "border-slate-200 bg-white/80 hover:border-rose-200 hover:bg-rose-50/40"
      }`}
    >
      <p className="break-safe font-[family-name:var(--font-display)] text-base font-bold text-slate-900 sm:text-lg">
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
      className="flex w-full min-w-0 flex-wrap gap-2"
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
                ? "bg-rose-600 text-white"
                : "bg-rose-50 text-rose-800 hover:bg-rose-100"
            }`}
          >
            {option.label}
            <span
              className={`rounded-full px-1.5 text-[10px] ${
                active ? "bg-white/20" : "bg-white text-rose-700"
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
  knownCompanies,
  openCount,
  onCreated,
  onCancel,
}: {
  knownCompanies: string[];
  openCount: number;
  onCreated: (request: ReferralRequest) => void;
  onCancel: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [context, setContext] = useState("");
  const [jobLink, setJobLink] = useState("");
  const [deadline, setDeadline] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [graduateCount, setGraduateCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestions = useMemo(() => {
    const q = company.trim().toLowerCase();
    if (!q) return knownCompanies.slice(0, 8);
    return knownCompanies
      .filter((c) => c.toLowerCase().includes(q))
      .slice(0, 8);
  }, [company, knownCompanies]);

  useEffect(() => {
    const trimmed = company.trim();
    if (trimmed.length < 2) {
      setGraduateCount(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        const { data } = await supabase.rpc("graduates_at_company", {
          p_company: trimmed,
        });
        if (!cancelled) setGraduateCount(typeof data === "number" ? data : 0);
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [company, supabase]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    if (openCount >= 3) {
      setError("You can have at most 3 open referral requests at a time.");
      setLoading(false);
      return;
    }

    if (!company.trim() || !role.trim()) {
      setError("Company and role are required.");
      setLoading(false);
      return;
    }

    if (context.trim().length < 20) {
      setError("Add a bit more context (why this role / why you’re a fit).");
      setLoading(false);
      return;
    }

    if (!resumeFile) {
      setError("Upload a resume before posting — referrers need it.");
      setLoading(false);
      return;
    }

    if (resumeFile.size > 5 * 1024 * 1024) {
      setError("Resume must be under 5 MB.");
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

    const { data, error: insertError } = await supabase
      .from("referral_requests")
      .insert({
        student_id: user.id,
        company: company.trim().replace(/\s+/g, " "),
        role: role.trim(),
        context: context.trim(),
        job_link: jobLink.trim() || null,
        deadline: deadline || null,
        resume_url: path,
        status: "open" satisfies ReferralStatus,
      })
      .select(REFERRAL_SELECT)
      .single();

    if (insertError) {
      setError(mapReferralError(insertError.message));
      setLoading(false);
      return;
    }

    onCreated(normalizeReferralRequest(data as Record<string, unknown>));
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          Company
        </span>
        <input
          list="known-companies"
          required
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Google, Stripe…"
          className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
        />
        <datalist id="known-companies">
          {suggestions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <p className="mt-1.5 text-xs text-slate-500">
          {postingExpectation(company, graduateCount)}
        </p>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          Role
        </span>
        <input
          required
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Software Engineer Intern"
          className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          Why this role / your fit
        </span>
        <textarea
          required
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={3}
          placeholder="2–3 lines: why you want this, and what makes you a fit."
          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
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
            className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
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
            className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Resume <span className="font-normal text-rose-600">(required)</span>
          </span>
          <input
            type="file"
            required
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
            className="block w-full min-w-0 max-w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-rose-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-rose-800"
          />
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
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}

function ReferralCard({
  request,
  currentUserId,
  mode,
  busy,
  reach,
  onAsk,
  onAccept,
  onDismiss,
  onClose,
  onMarkReferred,
}: {
  request: ReferralRequest;
  currentUserId: string;
  mode: ViewMode;
  busy: boolean;
  reach: ReferralReachStats | null;
  onAsk: () => void;
  onAccept: () => void;
  onDismiss: () => void;
  onClose: () => void;
  onMarkReferred: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const isPoster = request.student_id === currentUserId;
  const isAcceptor = request.accepted_by === currentUserId;
  const canHelp =
    mode === "help" && request.status === "open" && !isPoster;
  const deadlineText = deadlineLabel(request.deadline);
  const urgent = isDeadlineUrgent(request.deadline);
  const studentName = request.student?.full_name?.trim() || "Student";
  const partnerId = isPoster ? request.accepted_by : request.student_id;
  const unlocked =
    request.status === "accepted" &&
    (isPoster || isAcceptor) &&
    partnerId;

  async function openResume() {
    if (!request.resume_url) return;
    const { data, error } = await supabase.storage
      .from("resumes")
      .createSignedUrl(request.resume_url, 60);
    if (error || !data?.signedUrl) {
      alert(error?.message || "Could not open resume.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <SurfaceCard as="article" className="min-w-0 overflow-hidden p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-rose-700/80">
            {request.company}
          </p>
          <h3
            title={request.role}
            className="mt-0.5 truncate text-base font-bold text-slate-900"
          >
            {request.role}
          </h3>
        </div>
        <StatusBadge status={request.status} />
      </div>

      {mode === "need" && (
        <p className="mt-2 text-xs font-semibold text-rose-800/90">
          {reachLabel(request, reach)}
        </p>
      )}

      {mode === "help" && (
        <div className="mt-3 flex min-w-0 items-center gap-3">
          <ProfilePreviewTrigger
            userId={request.student_id}
            className="shrink-0"
          >
            <Avatar
              name={request.student?.full_name ?? null}
              url={request.student?.avatar_url ?? null}
            />
          </ProfilePreviewTrigger>
          <div className="min-w-0 text-sm">
            <ProfilePreviewTrigger userId={request.student_id}>
              <p
                title={studentName}
                className="truncate font-medium text-slate-800"
              >
                {studentName}
              </p>
            </ProfilePreviewTrigger>
            <p className="truncate text-xs text-slate-500">
              {[
                request.student?.batch_year != null
                  ? `Batch ${request.student.batch_year}`
                  : null,
                request.student?.department?.trim() || null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>
        </div>
      )}

      {request.context?.trim() && (
        <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">
          {request.context.trim()}
        </p>
      )}

      <div className="mt-3 flex min-w-0 flex-wrap gap-2 text-xs">
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
        {request.resume_url && (
          <button
            type="button"
            onClick={() => void openResume()}
            className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-200"
          >
            Resume
          </button>
        )}
        {request.job_link && (
          <a
            href={request.job_link}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-200"
          >
            Job posting
          </a>
        )}
      </div>

      {mode === "need" && (
        <Timeline request={request} />
      )}

      <div className="mt-4 flex min-w-0 flex-wrap gap-2">
        {canHelp && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={onAsk}
              className="btn-secondary disabled:opacity-60"
            >
              Ask a question
            </button>
            <button
              type="button"
              disabled={busy || isAcceptor}
              onClick={onAccept}
              className="btn-primary disabled:opacity-60"
            >
              {busy
                ? "…"
                : isAcceptor
                  ? "You're referring this"
                  : "Accept & refer"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDismiss}
              className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
            >
              Not a fit
            </button>
          </>
        )}

        {unlocked && (
          <Link
            href={`/messages?with=${partnerId}`}
            className="btn-primary"
          >
            Message {isPoster ? "referrer" : studentName.split(" ")[0]}
          </Link>
        )}

        {mode === "need" && isPoster && request.status === "accepted" && !request.referred_at && (
          <button
            type="button"
            disabled={busy}
            onClick={onMarkReferred}
            className="btn-secondary disabled:opacity-60"
          >
            Mark as referred
          </button>
        )}

        {mode === "need" &&
          isPoster &&
          (request.status === "open" || request.status === "accepted") && (
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              Close
            </button>
          )}

        {mode === "help" && isAcceptor && !request.referred_at && (
          <button
            type="button"
            disabled={busy}
            onClick={onMarkReferred}
            className="btn-secondary disabled:opacity-60"
          >
            Mark as referred
          </button>
        )}
      </div>
    </SurfaceCard>
  );
}

function Timeline({ request }: { request: ReferralRequest }) {
  const views = request.view_count ?? 0;
  const questions = request.question_count ?? 0;
  const steps = [
    { label: "Posted", done: true },
    {
      label: views > 0 ? `Seen by ${views}` : "Seen by…",
      done: views > 0,
    },
    {
      label: questions > 0 ? `${questions} question${questions === 1 ? "" : "s"}` : "Questions",
      done: questions > 0,
    },
    {
      label: "Accepted",
      done: request.status === "accepted" || Boolean(request.referred_at),
    },
    {
      label: "Referral submitted",
      done: Boolean(request.referred_at),
    },
  ];

  return (
    <ol className="mt-4 flex min-w-0 flex-wrap gap-1.5">
      {steps.map((step, i) => (
        <li
          key={step.label}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            step.done
              ? "bg-teal-50 text-teal-800"
              : "bg-slate-100 text-slate-400"
          }`}
        >
          {i > 0 && <span className="opacity-40">→</span>}
          {step.label}
        </li>
      ))}
    </ol>
  );
}

function AskQuestionModal({
  request,
  busy,
  onClose,
  onSend,
}: {
  request: ReferralRequest;
  busy: boolean;
  onClose: () => void;
  onSend: (content: string) => void;
}) {
  const [content, setContent] = useState("");
  const name = request.student?.full_name?.trim() || "them";

  return (
    <AppModal
      open
      onClose={onClose}
      title="Ask a question"
      description={
        <>
          Chat unlocks with{" "}
          <span title={name} className="inline-block max-w-[12rem] truncate align-bottom font-semibold">
            {name}
          </span>{" "}
          after you send — no commitment to refer yet.
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (content.trim().length < 3 || busy) return;
          onSend(content);
        }}
        className="space-y-3"
      >
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          autoFocus
          placeholder="e.g. What’s your strongest project for this role?"
          className="w-full resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
        />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || content.trim().length < 3}
            className="btn-primary flex-1 disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send & open chat"}
          </button>
        </div>
      </form>
    </AppModal>
  );
}

function AcceptChecklistModal({
  request,
  onClose,
}: {
  request: ReferralRequest;
  onClose: () => void;
}) {
  const name = request.student?.full_name?.trim() || "them";
  const first = name.split(" ")[0];
  return (
    <AppModal
      open
      onClose={onClose}
      title="You’re referring them"
      description="Chat is unlocked. Here’s what usually happens next."
    >
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>Get their latest resume (already attached if they uploaded one).</li>
        <li>Submit the referral in your company’s internal tool.</li>
        <li>Share the application / referral ID back in chat.</li>
      </ol>
      <p className="mt-3 text-sm text-slate-500">
        You can message {first} anytime from Referrals or Messages.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <Link
          href={`/messages?with=${request.student_id}`}
          className="btn-primary w-full text-center"
          onClick={onClose}
        >
          Message {first}
        </Link>
        <button type="button" onClick={onClose} className="btn-secondary w-full">
          Close
        </button>
      </div>
    </AppModal>
  );
}

function StatusBadge({ status }: { status: ReferralStatus }) {
  const styles =
    status === "open"
      ? "bg-amber-50 text-amber-800"
      : status === "accepted"
        ? "bg-teal-50 text-teal-800"
        : status === "expired"
          ? "bg-slate-100 text-slate-500"
          : "bg-slate-100 text-slate-600";

  const label =
    status === "open"
      ? "Waiting"
      : status === "accepted"
        ? "Matched"
        : status === "expired"
          ? "Expired"
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
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-2 ring-rose-100"
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-bold text-rose-800"
    >
      {getInitials(name)}
    </div>
  );
}
