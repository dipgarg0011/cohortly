"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getInitials, SKILL_OPTIONS } from "@/lib/network";
import { EmptyState } from "@/components/ui/empty-state";
import { SurfaceCard } from "@/components/ui/surface-card";
import { AppModal } from "@/components/ui/app-modal";
import { IconMentorEmpty } from "@/components/ui/icons";
import {
  formatRelativeExpiry,
  identityIsMasked,
  mapMentorshipError,
  normalizeMatchedAsk,
  normalizeMentorshipRequest,
  normalizeRequestAnswer,
  REQUEST_STATUS_LABEL,
  URGENCY_LABEL,
  type MatchedAsk,
  type MentorshipRequest,
  type RequestAnswer,
  type RequestMatch,
} from "@/lib/mentorship";

type Tab = "ask" | "inbox" | "my_asks";

type Props = {
  currentUserId: string;
  isGraduate: boolean;
  initialRequests: MentorshipRequest[];
  initialMatchedAsks: MatchedAsk[];
  initialAnswers: RequestAnswer[];
  connectedByRequestId?: Record<string, RequestMatch>;
};

const REQUEST_COLS =
  "id, student_id, title, description, tags, category, target_company, urgency, preferred_duration, status, expires_at, created_at, is_anonymous, revealed_at, quality_score";

const ANSWER_COLS =
  "id, request_id, match_id, mentor_id, content, is_public, helpful, created_at";

export function MentorsBoard({
  isGraduate,
  initialRequests,
  initialMatchedAsks,
  initialAnswers,
  connectedByRequestId = {},
}: Props) {
  const [tab, setTab] = useState<Tab>(isGraduate ? "inbox" : "ask");
  const [requests, setRequests] = useState(initialRequests);
  const [asks, setAsks] = useState(initialMatchedAsks);
  const [answers, setAnswers] = useState(initialAnswers);
  const [connected] = useState(connectedByRequestId);

  const pendingInbox = asks.filter((a) => a.match_status === "pending");
  const respondedInbox = asks.filter((a) => a.match_status !== "pending");

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "ask", label: "Ask for help" },
    ...(isGraduate
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

      {tab === "inbox" && isGraduate && (
        <MentorInbox
          pending={pendingInbox}
          responded={respondedInbox}
          onAsksChange={setAsks}
        />
      )}

      {tab === "my_asks" && (
        <MyAsks
          requests={requests}
          answers={answers}
          connectedByRequestId={connected}
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

  function toggleTag(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

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
    setLoading(false);
  }

  return (
    <SurfaceCard className="p-5 sm:p-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-slate-900">
          What do you need help with?
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Three things: a title, a short note, and a topic. We&apos;ll find
          matching graduates for you.
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
    </SurfaceCard>
  );
}

function MentorInbox({
  pending,
  responded,
  onAsksChange,
}: {
  pending: MatchedAsk[];
  responded: MatchedAsk[];
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

    const { error: updateError } = await supabase
      .from("request_matches")
      .update({ status })
      .eq("id", matchId);

    if (updateError) {
      setError(mapMentorshipError(updateError));
      setBusyId(null);
      return;
    }

    const refreshed = await refreshAsk(matchId);
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
                onAccept={() => void respond(ask.match_id, "accepted")}
                onDecline={() => void respond(ask.match_id, "declined")}
                onAnswer={() => setAnswerAsk(ask)}
              />
            ))}
          </ul>
        )}
      </section>

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
  onAccept,
  onDecline,
  onAnswer,
}: {
  ask: MatchedAsk;
  busy: boolean;
  readonly?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onAnswer?: () => void;
}) {
  const masked = identityIsMasked(ask);
  const name = masked
    ? "Anonymous student"
    : ask.student_full_name?.trim() || "Student";

  return (
    <li className="surface-card min-w-0 max-w-full p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <Avatar
              name={masked ? null : ask.student_full_name}
              url={masked ? null : ask.student_avatar_url}
              anonymous={masked}
            />
            <div className="min-w-0">
              <p title={name} className="truncate font-semibold text-slate-900">
                {name}
              </p>
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
                href={`/messages?with=${ask.student_id}`}
                className="rounded-xl border border-teal-200 bg-white px-4 py-2 text-center text-sm font-semibold text-teal-800 hover:bg-teal-50"
              >
                Message
              </Link>
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
  onRequestsChange,
  onAnswersChange,
}: {
  requests: MentorshipRequest[];
  answers: RequestAnswer[];
  connectedByRequestId: Record<string, RequestMatch>;
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
          return (
            <li key={req.id} className="surface-card p-5">
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
                  <p className="mt-2 text-xs text-slate-400">
                    {formatRelativeExpiry(req.expires_at)}
                  </p>
                  {connected?.mentor && (
                    <p className="mt-2 text-sm font-medium text-teal-800">
                      Connected with{" "}
                      {connected.mentor.full_name?.trim() || "a mentor"}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {connected && (
                    <Link
                      href={`/messages?with=${connected.mentor_id}`}
                      className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50"
                    >
                      Message
                    </Link>
                  )}
                  {req.status === "open" && (
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
                      <p
                        title={answer.mentor?.full_name?.trim() || "Mentor"}
                        className="truncate text-sm font-semibold text-slate-900"
                      >
                        {answer.mentor?.full_name?.trim() || "Mentor"}
                      </p>
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
                          href={`/messages?with=${answer.mentor_id}`}
                          className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-teal-800 ring-1 ring-teal-200"
                        >
                          Follow up
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
