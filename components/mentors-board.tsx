"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getInitials, getProfileRole, SKILL_OPTIONS } from "@/lib/network";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { AppModal } from "@/components/ui/app-modal";
import { IconMentorEmpty } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatAbsoluteTime } from "@/lib/format-time";
import {
  evaluateDraftHelp,
  formatRelativeExpiry,
  identityIsMasked,
  liveStateCopy,
  mapMentorshipError,
  normalizeLiveState,
  normalizeMatchedAsk,
  normalizeMentorshipRequest,
  normalizeRequestAnswer,
  REQUEST_STATUS_LABEL,
  stageLabel,
  URGENCY_LABEL,
  type MatchedAsk,
  type MentorshipLiveState,
  type MentorshipRequest,
  type RequestAnswer,
  type RequestMatch,
} from "@/lib/mentorship";
import { ProfilePreviewTrigger } from "@/components/profile-preview";

type Tab = "ask" | "inbox" | "my_asks";

type Props = {
  currentUserId: string;
  isGraduate: boolean;
  /** Confirmed + available — do not force true on page load. */
  initialAvailable: boolean;
  initialRequests: MentorshipRequest[];
  initialMatchedAsks: MatchedAsk[];
  initialAnswers: RequestAnswer[];
  connectedByRequestId?: Record<string, RequestMatch>;
  studentDepartment?: string | null;
};

const REQUEST_COLS =
  "id, student_id, title, description, tags, category, target_company, urgency, preferred_duration, status, expires_at, created_at, is_anonymous, revealed_at, quality_score, reach_stage, last_escalated_at, nudge_count, resolution, is_public_after_expiry, awaiting_resolution_at";

const ANSWER_COLS =
  "id, request_id, match_id, mentor_id, content, is_public, helpful, created_at";

export function MentorsBoard({
  isGraduate,
  initialAvailable,
  initialRequests,
  initialMatchedAsks,
  initialAnswers,
  connectedByRequestId = {},
  studentDepartment = null,
}: Props) {
  // Graduates only: inbox when available or they already have matched asks.
  const showInbox =
    isGraduate && (initialAvailable || initialMatchedAsks.length > 0);
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(showInbox ? "inbox" : "ask");
  const [requests, setRequests] = useState(initialRequests);
  const [asks, setAsks] = useState(initialMatchedAsks);
  const [answers, setAnswers] = useState(initialAnswers);
  const [connected] = useState(connectedByRequestId);
  const [highlightRequestId, setHighlightRequestId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const nextTab = searchParams.get("tab");
    if (nextTab === "inbox" && showInbox) setTab("inbox");
    else if (nextTab === "mine" || nextTab === "my_asks") setTab("my_asks");
    else if (nextTab === "ask") setTab("ask");
    const rid = searchParams.get("requestId");
    setHighlightRequestId(rid);
    if (rid) {
      window.setTimeout(() => {
        document
          .getElementById(`request-${rid}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
    }
  }, [searchParams, showInbox]);

  const pendingInbox = asks.filter((a) => a.match_status === "pending");
  const respondedInbox = asks.filter((a) => a.match_status !== "pending");
  const unansweredPool = pendingInbox.filter((a) => {
    const ageDays =
      (Date.now() - new Date(a.request_created_at).getTime()) /
      (1000 * 60 * 60 * 24);
    return ageDays >= 9;
  });
  const regularPending = pendingInbox.filter((a) => {
    const ageDays =
      (Date.now() - new Date(a.request_created_at).getTime()) /
      (1000 * 60 * 60 * 24);
    return ageDays < 9;
  });

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "ask", label: "Ask for help" },
    ...(showInbox
      ? [
          {
            id: "inbox" as const,
            label: "For you",
            badge: pendingInbox.length,
          },
        ]
      : []),
    { id: "my_asks", label: "My asks" },
  ];

  return (
    <div className="space-y-6 min-w-0 overflow-x-clip">
      {isGraduate && !initialAvailable ? (
        <p className="text-sm text-slate-600">
          Mentoring settings live on your{" "}
          <Link
            href="/profile/mentoring"
            className="font-semibold text-teal-800 hover:underline"
          >
            profile
          </Link>
          . You&apos;ll see matching asks here once you&apos;re available.
        </p>
      ) : null}

      <div
        className={`grid w-full min-w-0 gap-1 rounded-xl bg-teal-50 p-1 ${
          tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"
        } sm:max-w-xl`}
        role="tablist"
      >
        {tabs.map((option) => {
          const active = tab === option.id;
          const shortLabel =
            option.id === "ask"
              ? "Ask"
              : option.id === "my_asks"
                ? "Mine"
                : option.label;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(option.id)}
              className={`min-w-0 rounded-lg px-1.5 py-2 text-[11px] font-semibold leading-tight transition sm:px-2 sm:text-sm ${
                active
                  ? "bg-white text-teal-900 shadow-sm"
                  : "text-teal-700/70 hover:text-teal-900"
              }`}
            >
              <span className="sm:hidden">{shortLabel}</span>
              <span className="hidden sm:inline">{option.label}</span>
              {option.badge != null && option.badge > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-600 px-1.5 text-[10px] font-bold text-white sm:ml-1.5">
                  {option.badge > 9 ? "9+" : option.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "ask" && (
        <AskForHelpForm
          onCreated={(req) => {
            setRequests((prev) => [req, ...prev]);
            setTab("my_asks");
          }}
        />
      )}

      {tab === "inbox" && showInbox && (
        <MentorInbox
          pending={regularPending}
          unansweredPool={unansweredPool}
          responded={respondedInbox}
          highlightRequestId={highlightRequestId}
          onAsksChange={setAsks}
        />
      )}

      {tab === "my_asks" && (
        <MyAsks
          requests={requests}
          answers={answers}
          connectedByRequestId={connected}
          studentDepartment={studentDepartment}
          highlightRequestId={highlightRequestId}
          onRequestsChange={setRequests}
          onAnswersChange={setAnswers}
        />
      )}
    </div>
  );
}

function AskForHelpForm({
  onCreated,
}: {
  onCreated: (request: MentorshipRequest) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    match_count: number;
    suggested_tags: string[];
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("cohortly:repost");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        title?: string;
        description?: string;
        tags?: string[];
      };
      if (parsed.title) setTitle(parsed.title);
      if (parsed.description) setDescription(parsed.description);
      if (parsed.tags?.length) setTags(parsed.tags);
      window.sessionStorage.removeItem("cohortly:repost");
    } catch {
      /* ignore */
    }
  }, []);

  const draftHelp = useMemo(
    () => evaluateDraftHelp(description),
    [description],
  );

  function toggleTag(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  useEffect(() => {
    if (tags.length === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setPreviewLoading(true);
        const { data } = await supabase.rpc("preview_mentorship_matches", {
          p_tags: tags,
          p_title: title.trim() || null,
          p_description: description.trim() || null,
        });
        if (cancelled) return;
        const row = Array.isArray(data) ? data[0] : data;
        if (row) {
          setPreview({
            match_count: Number(
              (row as { match_count?: number }).match_count ?? 0,
            ),
            suggested_tags:
              ((row as { suggested_tags?: string[] }).suggested_tags as
                | string[]
                | undefined) ?? [],
          });
        }
        setPreviewLoading(false);
      })();
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tags, title, description, supabase]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const trimmedTitle = title.trim();
    const trimmedDesc = description.trim();

    if (trimmedTitle.length < 3) {
      setError("Add a short title.");
      setLoading(false);
      return;
    }
    if (trimmedDesc.length < 20) {
      setError("Add a bit more detail so mentors know how to help.");
      setLoading(false);
      return;
    }
    if (tags.length === 0) {
      setError("Pick at least one topic so we can find the right people.");
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
      .from("mentorship_requests")
      .insert({
        student_id: user.id,
        title: trimmedTitle,
        description: trimmedDesc,
        tags,
        category: null,
        target_company: null,
        urgency: "flexible",
        preferred_duration: 30,
        status: "open",
        is_anonymous: isAnonymous,
      })
      .select(REQUEST_COLS)
      .single();

    if (insertError) {
      setError(mapMentorshipError(insertError));
      setLoading(false);
      return;
    }

    onCreated(normalizeMentorshipRequest(data as Record<string, unknown>));
    setTitle("");
    setDescription("");
    setTags([]);
    setIsAnonymous(false);
    setPreview(null);
    setLoading(false);
  }

  return (
    <SectionCard className="!p-5 sm:!p-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">
          What do you need help with?
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Three things: a title, a short note, and a topic. Your ask goes to
          matching graduates — you choose who to follow up with.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Title
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="e.g. SDE interview prep"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Your ask
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="What do you need help with?"
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </label>

        <div className="rounded-xl bg-amber-50/70 px-3.5 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-900/80">
            Draft help
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
            <li className="flex items-center gap-2">
              <span
                className={
                  draftHelp.goal ? "text-emerald-700" : "text-slate-400"
                }
              >
                {draftHelp.goal ? "✓" : "○"}
              </span>
              Clear goal (what you want)
            </li>
            <li className="flex items-center gap-2">
              <span
                className={
                  draftHelp.tried ? "text-emerald-700" : "text-slate-400"
                }
              >
                {draftHelp.tried ? "✓" : "○"}
              </span>
              What you&apos;ve already tried
            </li>
            <li className="flex items-center gap-2">
              <span
                className={
                  draftHelp.specific ? "text-emerald-700" : "text-slate-400"
                }
              >
                {draftHelp.specific ? "✓" : "○"}
              </span>
              A specific question
            </li>
          </ul>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Topic
          </span>
          <div className="flex flex-wrap gap-2">
            {SKILL_OPTIONS.map((tag) => {
              const active = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    active
                      ? "bg-amber-700 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-amber-50"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {tags.length > 0 && (
          <div className="rounded-xl border border-teal-900/10 bg-teal-50/50 px-3.5 py-3 text-sm text-slate-700">
            {previewLoading && !preview ? (
              <p>Checking who matches…</p>
            ) : preview && preview.match_count >= 4 ? (
              <p>
                <span className="font-bold text-teal-900">
                  {preview.match_count} graduates match this
                </span>{" "}
                — good chance of a reply.
              </p>
            ) : preview && preview.match_count === 1 ? (
              <div className="space-y-2">
                <p>
                  <span className="font-bold text-amber-900">
                    Only 1 graduate matches these tags.
                  </span>{" "}
                  Try broader tags, or post anyway and we&apos;ll widen it
                  automatically.
                </p>
                {preview.suggested_tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">Try adding:</span>
                    {preview.suggested_tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-200"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : preview && preview.match_count === 0 ? (
              <div className="space-y-2">
                <p>
                  <span className="font-bold text-amber-900">
                    No strong matches yet.
                  </span>{" "}
                  Post anyway — we&apos;ll widen reach over the next days so it
                  never sits unseen.
                </p>
                {preview.suggested_tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">Try:</span>
                    {preview.suggested_tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-200"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : preview ? (
              <div className="space-y-2">
                <p>
                  <span className="font-bold text-teal-900">
                    {preview.match_count} graduates match
                  </span>
                  {preview.match_count < 4
                    ? " — a bit thin. Broader tags help, or post and we'll widen automatically."
                    : "."}
                </p>
                {preview.match_count < 4 &&
                  preview.suggested_tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">Try adding:</span>
                      {preview.suggested_tags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-200"
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            ) : null}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
          />
          Ask anonymously
        </label>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary disabled:opacity-60"
        >
          {loading ? "Sending…" : "Post ask"}
        </button>
      </form>
    </SectionCard>
  );
}

function MentorInbox({
  pending,
  unansweredPool,
  responded,
  highlightRequestId = null,
  onAsksChange,
}: {
  pending: MatchedAsk[];
  unansweredPool: MatchedAsk[];
  responded: MatchedAsk[];
  highlightRequestId?: string | null;
  onAsksChange: (updater: (prev: MatchedAsk[]) => MatchedAsk[]) => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [answerAsk, setAnswerAsk] = useState<MatchedAsk | null>(null);

  async function refreshAsk(matchId: string) {
    const { data } = await supabase.rpc("get_matched_ask", {
      p_match_id: matchId,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return normalizeMatchedAsk(row as Record<string, unknown>);
  }

  async function respond(matchId: string, status: "accepted" | "declined") {
    setBusyId(matchId);
    setError(null);

    const prior = pending
      .concat(unansweredPool)
      .concat(responded)
      .find((a) => a.match_id === matchId);

    const { error: updateError } = await supabase
      .from("request_matches")
      .update({ status })
      .eq("id", matchId);

    if (updateError) {
      console.error("request_matches status update failed", updateError);
      setError(mapMentorshipError(updateError));
      setBusyId(null);
      return;
    }

    const refreshed = await refreshAsk(matchId);
    if (!refreshed && status === "accepted") {
      setError(
        "Accept didn't stick — refresh and try again. If this keeps happening, the match may already be taken.",
      );
      setBusyId(null);
      router.refresh();
      return;
    }
    if (refreshed) {
      onAsksChange((prev) =>
        prev.map((a) => (a.match_id === matchId ? refreshed : a)),
      );
    } else {
      onAsksChange((prev) =>
        prev.map((a) =>
          a.match_id === matchId ? { ...a, match_status: status } : a,
        ),
      );
    }

    setBusyId(null);

    if (status === "accepted") {
      const studentId = refreshed?.student_id ?? prior?.student_id;
      if (studentId) {
        const rid = refreshed?.request_id ?? prior?.request_id;
        router.push(
          rid
            ? `/messages?with=${studentId}&request=${rid}`
            : `/messages?with=${studentId}`,
        );
        return;
      }
      setError(
        "Accepted, but we couldn't open chat yet (identity may still be hidden). Refresh Mentors and use Message.",
      );
    }

    router.refresh();
  }

  return (
    <div className="space-y-8">
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <section>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">
          Asks for you
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Accept to chat, reply in text, or decline. That&apos;s it.
        </p>

        {pending.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-teal-900/15 bg-white/60 px-5 py-8 text-center text-sm text-slate-500">
            No pending asks right now. When a student&apos;s needs match your
            skills, they&apos;ll show up here.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {pending.map((ask) => (
              <MatchAskCard
                key={ask.match_id}
                ask={ask}
                busy={busyId === ask.match_id}
                highlighted={highlightRequestId === ask.request_id}
                onAccept={() => void respond(ask.match_id, "accepted")}
                onDecline={() => void respond(ask.match_id, "declined")}
                onAnswer={() => setAnswerAsk(ask)}
              />
            ))}
          </ul>
        )}
      </section>

      {unansweredPool.length > 0 && (
        <section>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-900">
            Unanswered asks
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Nobody has picked these up yet — no pressure, just visibility.
          </p>
          <ul className="mt-4 space-y-4">
            {unansweredPool.map((ask) => (
              <MatchAskCard
                key={ask.match_id}
                ask={ask}
                busy={busyId === ask.match_id}
                highlighted={highlightRequestId === ask.request_id}
                onAccept={() => void respond(ask.match_id, "accepted")}
                onDecline={() => void respond(ask.match_id, "declined")}
                onAnswer={() => setAnswerAsk(ask)}
              />
            ))}
          </ul>
        </section>
      )}

      {responded.length > 0 && (
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wide text-amber-800/80">
            Earlier
          </h2>
          <ul className="mt-3 space-y-3">
            {responded.map((ask) => (
              <MatchAskCard
                key={ask.match_id}
                ask={ask}
                busy={false}
                readonly
                highlighted={highlightRequestId === ask.request_id}
                onAnswer={
                  ask.match_status === "accepted" ||
                  ask.match_status === "answered"
                    ? () => setAnswerAsk(ask)
                    : undefined
                }
              />
            ))}
          </ul>
        </section>
      )}

      {answerAsk && (
        <AnswerModal
          ask={answerAsk}
          onClose={() => setAnswerAsk(null)}
          onPosted={async () => {
            const refreshed = await refreshAsk(answerAsk.match_id);
            if (refreshed) {
              onAsksChange((prev) =>
                prev.map((a) =>
                  a.match_id === answerAsk.match_id ? refreshed : a,
                ),
              );
            }
            setAnswerAsk(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function MatchAskCard({
  ask,
  busy,
  readonly = false,
  highlighted = false,
  onAccept,
  onDecline,
  onAnswer,
}: {
  ask: MatchedAsk;
  busy: boolean;
  readonly?: boolean;
  highlighted?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onAnswer?: () => void;
}) {
  const masked = identityIsMasked(ask);
  const name = masked
    ? "Anonymous student"
    : ask.student_full_name?.trim() || "Student";
  const previewId = masked ? null : ask.student_id;
  const studentRole = getProfileRole(ask.student_status);

  return (
    <li
      id={`request-${ask.request_id}`}
      className={`surface-card min-w-0 max-w-full p-4 sm:p-5 ${
        highlighted ? "ring-2 ring-teal-500 ring-offset-2" : ""
      }`}
    >
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <ProfilePreviewTrigger
              userId={previewId}
              enabled={!masked}
              className="shrink-0"
            >
              <Avatar
                name={masked ? null : ask.student_full_name}
                url={masked ? null : ask.student_avatar_url}
                anonymous={masked}
              />
            </ProfilePreviewTrigger>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <ProfilePreviewTrigger userId={previewId} enabled={!masked}>
                  <p
                    title={name}
                    className="truncate font-semibold text-slate-900"
                  >
                    {name}
                  </p>
                </ProfilePreviewTrigger>
                <StatusBadge role={studentRole} />
              </div>
              <p className="meta-text mt-0.5">
                {[
                  ask.student_department,
                  ask.student_batch_year != null
                    ? `Batch ${ask.student_batch_year}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "College community"}
              </p>
              {ask.is_anonymous && (
                <span className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  {masked ? "Identity hidden" : "Was anonymous"}
                </span>
              )}
            </div>
          </div>

          <h3 className="mt-3 break-safe text-lg font-bold text-slate-900">
            {ask.title}
          </h3>
          <p className="mt-2 break-safe whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {ask.description}
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {ask.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900"
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            {ask.category && (
              <span className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                {ask.category}
              </span>
            )}
            <span className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-700">
              {URGENCY_LABEL[ask.urgency]}
            </span>
            <span className="rounded-lg bg-slate-100 px-2 py-1 font-semibold text-slate-700">
              {ask.preferred_duration} min
            </span>
          </div>

          {readonly && (
            <span
              className={`mt-3 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                ask.match_status === "accepted" ||
                ask.match_status === "answered"
                  ? "bg-teal-50 text-teal-800"
                  : ask.match_status === "declined"
                    ? "bg-slate-100 text-slate-600"
                    : "bg-amber-50 text-amber-800"
              }`}
            >
              {ask.match_status}
            </span>
          )}
        </div>

        <div className="btn-row w-full shrink-0 sm:w-auto sm:flex-col">
          {!readonly && ask.match_status === "pending" && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={onAccept}
                className="btn-primary disabled:opacity-60"
              >
                {busy ? "…" : "Accept & chat"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onAnswer}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 disabled:opacity-60"
              >
                Instant reply
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onDecline}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
              >
                Decline
              </button>
            </>
          )}
          {onAnswer &&
            (ask.match_status === "accepted" ||
              ask.match_status === "answered") && (
              <button
                type="button"
                onClick={onAnswer}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900"
              >
                {ask.match_status === "answered"
                  ? "Edit reply"
                  : "Instant reply"}
              </button>
            )}
          {ask.student_id &&
            (ask.match_status === "accepted" ||
              ask.match_status === "answered") && (
              <Link
                href={`/messages?with=${ask.student_id}&request=${ask.request_id}`}
                className="rounded-xl border border-teal-200 bg-white px-4 py-2 text-center text-sm font-semibold text-teal-800 hover:bg-teal-50"
              >
                Message
              </Link>
            )}
          {(ask.match_status === "accepted" ||
            ask.match_status === "answered") && (
            <p className="w-full text-[11px] leading-snug text-slate-500 sm:max-w-[14rem]">
              Edit reply updates the public answer. Message opens a private
              chat.
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function AnswerModal({
  ask,
  onClose,
  onPosted,
}: {
  ask: MatchedAsk;
  onClose: () => void;
  onPosted: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [content, setContent] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("request_answers")
        .select(ANSWER_COLS)
        .eq("match_id", ask.match_id)
        .maybeSingle();
      if (cancelled || !data) return;
      setExistingId(data.id as string);
      setContent((data.content as string) ?? "");
      setIsPublic(Boolean(data.is_public));
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [ask.match_id, supabase]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = content.trim();
    if (trimmed.length < 10) {
      setError("Write a bit more — at least a short paragraph.");
      return;
    }

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

    if (existingId) {
      const { error: updateError } = await supabase
        .from("request_answers")
        .update({ content: trimmed, is_public: isPublic })
        .eq("id", existingId)
        .eq("mentor_id", user.id);

      if (updateError) {
        console.error("request_answers update failed", updateError);
        setError(mapMentorshipError(updateError));
        setLoading(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from("request_answers")
        .insert({
          request_id: ask.request_id,
          match_id: ask.match_id,
          mentor_id: user.id,
          content: trimmed,
          is_public: isPublic,
        });

      if (insertError) {
        console.error("request_answers insert failed", insertError);
        setError(mapMentorshipError(insertError));
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    onPosted();
  }

  return (
    <AppModal
      open
      onClose={onClose}
      title="Instant reply"
      description="Write a quick answer. Chat unlocks so you can follow up if needed."
      maxWidthClass="sm:max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          placeholder="Be specific — steps, resources, what you'd do in their shoes…"
          className="w-full resize-y rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          autoFocus
        />
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700"
          />
          Allow this answer in a future public archive
        </label>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary flex-1 disabled:opacity-60"
          >
            {loading ? "Saving…" : existingId ? "Update reply" : "Send reply"}
          </button>
        </div>
      </form>
    </AppModal>
  );
}

function MyAsks({
  requests,
  answers,
  connectedByRequestId,
  studentDepartment = null,
  highlightRequestId = null,
  onRequestsChange,
  onAnswersChange,
}: {
  requests: MentorshipRequest[];
  answers: RequestAnswer[];
  connectedByRequestId: Record<string, RequestMatch>;
  studentDepartment?: string | null;
  highlightRequestId?: string | null;
  onRequestsChange: (
    updater: (prev: MentorshipRequest[]) => MentorshipRequest[],
  ) => void;
  onAnswersChange: (
    updater: (prev: RequestAnswer[]) => RequestAnswer[],
  ) => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [liveStates, setLiveStates] = useState<
    Record<string, MentorshipLiveState>
  >({});
  const [repostHintId, setRepostHintId] = useState<string | null>(null);

  useEffect(() => {
    void supabase.rpc("escalate_open_mentorship_requests");
    void supabase.rpc("apply_mentorship_expiry_rules");
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    async function loadLiveStates() {
      if (requests.length === 0) {
        setLiveStates({});
        return;
      }
      const entries = await Promise.all(
        requests.map(async (req) => {
          const { data } = await supabase.rpc(
            "get_mentorship_request_live_state",
            { p_request_id: req.id },
          );
          const row = Array.isArray(data) ? data[0] : data;
          if (!row) return null;
          return [
            req.id,
            normalizeLiveState(row as Record<string, unknown>),
          ] as const;
        }),
      );
      if (cancelled) return;
      const next: Record<string, MentorshipLiveState> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setLiveStates(next);
    }
    void loadLiveStates();
    return () => {
      cancelled = true;
    };
  }, [requests, supabase]);

  async function refreshLiveState(requestId: string) {
    const { data } = await supabase.rpc("get_mentorship_request_live_state", {
      p_request_id: requestId,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return;
    setLiveStates((prev) => ({
      ...prev,
      [requestId]: normalizeLiveState(row as Record<string, unknown>),
    }));
  }

  async function closeRequest(id: string) {
    setBusyId(id);
    setError(null);
    const { data, error: updateError } = await supabase
      .from("mentorship_requests")
      .update({ status: "closed" })
      .eq("id", id)
      .select(REQUEST_COLS)
      .single();
    if (updateError) {
      setError(mapMentorshipError(updateError));
      setBusyId(null);
      return;
    }
    onRequestsChange((prev) =>
      prev.map((r) =>
        r.id === id
          ? normalizeMentorshipRequest(data as Record<string, unknown>)
          : r,
      ),
    );
    setBusyId(null);
    router.refresh();
  }

  async function setHelpful(answerId: string, helpful: boolean) {
    setBusyId(answerId);
    setError(null);
    const { data, error: updateError } = await supabase
      .from("request_answers")
      .update({ helpful })
      .eq("id", answerId)
      .select(ANSWER_COLS)
      .single();
    if (updateError) {
      setError(mapMentorshipError(updateError));
      setBusyId(null);
      return;
    }
    const normalized = normalizeRequestAnswer(data as Record<string, unknown>);
    onAnswersChange((prev) =>
      prev.map((a) =>
        a.id === answerId
          ? { ...normalized, mentor: a.mentor }
          : a,
      ),
    );
    setBusyId(null);
  }

  async function resolveRequest(
    id: string,
    action: "post_public" | "watch",
  ) {
    setBusyId(id);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc(
      "resolve_mentorship_request",
      { p_request_id: id, p_action: action },
    );
    if (rpcError) {
      setError(mapMentorshipError(rpcError));
      setBusyId(null);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      onRequestsChange((prev) =>
        prev.map((r) =>
          r.id === id
            ? normalizeMentorshipRequest(row as Record<string, unknown>)
            : r,
        ),
      );
    }
    await refreshLiveState(id);
    setBusyId(null);
    router.refresh();
  }

  function saveRepostDraft(req: MentorshipRequest) {
    window.sessionStorage.setItem(
      "cohortly:repost",
      JSON.stringify({
        title: req.title,
        description: req.description,
        tags: req.tags,
      }),
    );
    setRepostHintId(req.id);
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={<IconMentorEmpty />}
        title="No asks yet"
        description="Post what you need help with — we'll match you to graduates with the right skills."
        accentSoft="var(--accent-mentors-soft)"
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <ul className="space-y-4">
        {requests.map((req) => {
          const connected = connectedByRequestId[req.id];
          const reqAnswers = answers.filter((a) => a.request_id === req.id);
          const state = liveStates[req.id];
          const stage = state?.computed_stage ?? req.reach_stage ?? 1;
          const showResolution =
            req.status === "awaiting_resolution" ||
            (state != null &&
              !state.has_answer &&
              state.age_days >= 14 &&
              state.computed_stage >= 4);

          return (
            <li
              id={`request-${req.id}`}
              key={req.id}
              className={`surface-card p-5 ${
                highlightRequestId === req.id
                  ? "ring-2 ring-teal-500 ring-offset-2"
                  : ""
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-safe font-bold text-slate-900">
                      {req.title}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        req.status === "matched"
                          ? "bg-teal-50 text-teal-800"
                          : req.status === "open"
                            ? "bg-amber-50 text-amber-800"
                            : req.status === "awaiting_resolution"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {REQUEST_STATUS_LABEL[req.status]}
                    </span>
                    {req.is_anonymous && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                        Anonymous
                      </span>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                    {req.description}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {req.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {state && (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-teal-800">
                          {stageLabel(state.computed_stage)}
                        </span>
                        <div
                          className="flex items-center gap-1"
                          aria-label={`Reach stage ${Math.min(4, Math.max(1, Math.round(stage)))} of 4`}
                        >
                          {[1, 2, 3, 4].map((n) => (
                            <span
                              key={n}
                              className={`h-1.5 w-1.5 rounded-full ${
                                n <= Math.min(4, Math.max(1, Math.round(stage)))
                                  ? "bg-teal-600"
                                  : "bg-slate-200"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-slate-600">
                        {liveStateCopy(state, studentDepartment)}
                      </p>
                    </div>
                  )}

                  <p
                    className="mt-2 text-xs text-slate-400"
                    title={formatAbsoluteTime(req.expires_at)}
                  >
                    {formatRelativeExpiry(req.expires_at)}
                  </p>
                  {connected?.mentor && (
                    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium text-teal-800">
                      <span>
                        Connected with{" "}
                        <ProfilePreviewTrigger userId={connected.mentor_id}>
                          {connected.mentor.full_name?.trim() || "a mentor"}
                        </ProfilePreviewTrigger>
                      </span>
                      <StatusBadge
                        role={getProfileRole(connected.mentor.status)}
                      />
                      {connected.mentor.batch_year != null && (
                        <span className="text-xs font-semibold text-slate-500">
                          Batch {connected.mentor.batch_year}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {connected && (
                    <Link
                      href={`/messages?with=${connected.mentor_id}&request=${req.id}`}
                      className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50"
                    >
                      Message
                    </Link>
                  )}
                  {(req.status === "open" ||
                    req.status === "awaiting_resolution") && (
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => void closeRequest(req.id)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
                    >
                      {busyId === req.id ? "…" : "Close ask"}
                    </button>
                  )}
                </div>
              </div>

              {showResolution && (
                <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3.5 py-3.5">
                  <p className="text-sm font-semibold text-amber-950">
                    Still unanswered — here&apos;s what you can do
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => void resolveRequest(req.id, "post_public")}
                      className="rounded-xl bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      Post this publicly
                    </button>
                    <button
                      type="button"
                      onClick={() => saveRepostDraft(req)}
                      className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-950"
                    >
                      Broaden and repost
                    </button>
                    <Link
                      href="/referrals"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-700"
                    >
                      Ask in Referrals instead
                    </Link>
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => void resolveRequest(req.id, "watch")}
                      className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 disabled:opacity-60"
                    >
                      Notify me when someone relevant joins
                    </button>
                  </div>
                  {repostHintId === req.id && (
                    <p className="text-xs text-amber-900">
                      Saved — open Ask for help to edit tags
                    </p>
                  )}
                </div>
              )}

              {reqAnswers.length > 0 && (
                <div className="mt-4 space-y-3 border-t border-teal-900/8 pt-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-800/80">
                    Answers
                  </p>
                  {reqAnswers.map((answer) => (
                    <div
                      key={answer.id}
                      className="rounded-xl bg-amber-50/50 px-3.5 py-3"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <ProfilePreviewTrigger userId={answer.mentor_id}>
                          <p
                            title={answer.mentor?.full_name?.trim() || "Mentor"}
                            className="truncate text-sm font-semibold text-slate-900"
                          >
                            {answer.mentor?.full_name?.trim() || "Mentor"}
                          </p>
                        </ProfilePreviewTrigger>
                        <StatusBadge
                          role={getProfileRole(answer.mentor?.status)}
                        />
                        {answer.mentor?.batch_year != null && (
                          <span className="text-xs font-semibold text-slate-500">
                            Batch {answer.mentor.batch_year}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 break-safe whitespace-pre-wrap text-sm text-slate-700">
                        {answer.content}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyId === answer.id}
                          onClick={() => void setHelpful(answer.id, true)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                            answer.helpful === true
                              ? "bg-emerald-600 text-white"
                              : "bg-white text-slate-700 ring-1 ring-slate-200"
                          }`}
                        >
                          Helpful
                        </button>
                        <button
                          type="button"
                          disabled={busyId === answer.id}
                          onClick={() => void setHelpful(answer.id, false)}
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                            answer.helpful === false
                              ? "bg-slate-700 text-white"
                              : "bg-white text-slate-700 ring-1 ring-slate-200"
                          }`}
                        >
                          Not helpful
                        </button>
                        <Link
                          href={`/messages?with=${answer.mentor_id}&request=${req.id}`}
                          className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-200"
                        >
                          Ask a follow-up
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Avatar({
  name,
  url,
  anonymous = false,
}: {
  name: string | null;
  url: string | null;
  anonymous?: boolean;
}) {
  if (anonymous) {
    return (
      <div
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600"
      >
        ?
      </div>
    );
  }
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-amber-100"
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-900"
    >
      {getInitials(name)}
    </div>
  );
}
