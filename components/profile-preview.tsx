"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppModal } from "@/components/ui/app-modal";
import { ConnectionRequestModal } from "@/components/connection-request-modal";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { createClient } from "@/lib/supabase/client";
import {
  connectionActionFor,
  studentTurnGate,
  type ConversationRow,
} from "@/lib/conversations";
import {
  firstName,
  getProfileRole,
  type NetworkProfile,
  type ProfileStatus,
} from "@/lib/network";

const PROFILE_SELECT =
  "id, full_name, batch_year, status, department, current_job, company, role_title, is_founder, open_to, skills, linkedin_url, avatar_url, bio";

const CONVERSATION_SELECT =
  "id, initiator_id, recipient_id, status, unlock_reason, intro_message_sent, created_at, updated_at, gate_mode, turn_holder, reply_count_by_recipient, gate_lifted_at, gate_student_id, turn_nudge_sent_at";

type PreviewContextValue = {
  openPreview: (userId: string) => void;
  closePreview: () => void;
};

const ProfilePreviewContext = createContext<PreviewContextValue | null>(null);

export function useProfilePreview(): PreviewContextValue {
  const ctx = useContext(ProfilePreviewContext);
  if (!ctx) {
    throw new Error(
      "useProfilePreview must be used within ProfilePreviewProvider",
    );
  }
  return ctx;
}

/** Safe for optional mounts — no-ops when provider is absent. */
export function useProfilePreviewOptional(): PreviewContextValue {
  const ctx = useContext(ProfilePreviewContext);
  return (
    ctx ?? {
      openPreview: () => undefined,
      closePreview: () => undefined,
    }
  );
}

type Props = {
  children: ReactNode;
};

export function ProfilePreviewProvider({ children }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerStatus, setViewerStatus] = useState<ProfileStatus | null>(null);
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<NetworkProfile | null>(null);
  const [mentorAvailable, setMentorAvailable] = useState(false);
  const [conversation, setConversation] = useState<ConversationRow | undefined>(
    undefined,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [requestTarget, setRequestTarget] = useState<{
    id: string;
    full_name: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadViewer() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      setViewerId(user.id);
      const { data } = await supabase
        .from("profiles")
        .select("status")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) {
        setViewerStatus((data?.status as ProfileStatus | null) ?? null);
      }
    }
    void loadViewer();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const closePreview = useCallback(() => {
    setOpenUserId(null);
    setProfile(null);
    setError(null);
    setLoading(false);
    setBioExpanded(false);
    setMentorAvailable(false);
    setConversation(undefined);
  }, []);

  const openPreview = useCallback((userId: string) => {
    if (!userId) return;
    setOpenUserId(userId);
    setProfile(null);
    setError(null);
    setLoading(true);
    setBioExpanded(false);
    setMentorAvailable(false);
    setConversation(undefined);
  }, []);

  useEffect(() => {
    if (!openUserId || !viewerId) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [{ data: row, error: profileError }, { data: avail }, { data: convRows }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select(PROFILE_SELECT)
            .eq("id", openUserId)
            .maybeSingle(),
          supabase
            .from("mentor_availability")
            .select("is_available")
            .eq("mentor_id", openUserId)
            .maybeSingle(),
          supabase
            .from("conversations")
            .select(CONVERSATION_SELECT)
            .or(
              `and(initiator_id.eq.${viewerId},recipient_id.eq.${openUserId}),and(initiator_id.eq.${openUserId},recipient_id.eq.${viewerId})`,
            )
            .limit(1),
        ]);

      if (cancelled) return;

      if (profileError || !row) {
        setError("Couldn't load this profile. Try again.");
        setProfile(null);
        setLoading(false);
        return;
      }

      setProfile(row as NetworkProfile);
      setMentorAvailable(Boolean(avail?.is_available));
      const conv = (convRows?.[0] as ConversationRow | undefined) ?? undefined;
      setConversation(conv);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [openUserId, viewerId, supabase]);

  const value = useMemo(
    () => ({ openPreview, closePreview }),
    [openPreview, closePreview],
  );

  const open = Boolean(openUserId);
  const isSelf = Boolean(viewerId && openUserId && viewerId === openUserId);
  const role = profile ? getProfileRole(profile.status) : null;
  const name = profile?.full_name?.trim() || "Unnamed member";
  const roleTitle =
    profile?.role_title?.trim() || profile?.current_job?.trim() || "";
  const company = profile?.company?.trim() || "";
  const department = profile?.department?.trim() || "";
  const bio = profile?.bio?.trim() || "";
  const skills = (profile?.skills ?? []).filter((s) => s.trim());
  const openTo = (profile?.open_to ?? []).filter((t) => t.trim());
  const linkedin = profile?.linkedin_url?.trim() || "";
  const shownSkills = skills.slice(0, 6);
  const extraSkills = Math.max(0, skills.length - 6);
  const partnerFirst = firstName(profile?.full_name);

  const action = connectionActionFor(conversation);
  const turnGate = studentTurnGate(conversation, viewerId ?? "");
  const messageDisabled =
    action.kind === "message" &&
    turnGate.isStudent &&
    turnGate.waitingOnMentor;
  const viewerIsStudent = getProfileRole(viewerStatus) === "Student";
  const showAskHelp =
    !isSelf &&
    mentorAvailable &&
    role === "Graduate" &&
    viewerIsStudent &&
    Boolean(profile);

  return (
    <ProfilePreviewContext.Provider value={value}>
      {children}

      <AppModal
        open={open && !requestTarget}
        onClose={closePreview}
        title="Profile"
        maxWidthClass="sm:max-w-[420px]"
      >
        {loading ? (
          <PreviewSkeleton />
        ) : error ? (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        ) : profile ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center">
              <PersonAvatar
                id={profile.id}
                name={profile.full_name}
                url={profile.avatar_url}
                size="xl"
              />
              <h3 className="mt-3 line-clamp-2 max-w-full font-[family-name:var(--font-display)] text-xl font-bold leading-snug text-slate-900">
                {name}
              </h3>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {role ? <StatusBadge role={role} /> : null}
                {profile.batch_year != null ? (
                  <span className="text-xs font-semibold text-slate-500">
                    Batch {profile.batch_year}
                  </span>
                ) : null}
                {department ? (
                  <span className="text-xs font-medium text-slate-500">
                    {department}
                  </span>
                ) : null}
                {profile.is_founder ? (
                  <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                    Founder
                  </span>
                ) : null}
              </div>
            </div>

            {(roleTitle || company) && (
              <div className="text-center text-sm">
                {roleTitle ? (
                  <p className="font-semibold text-slate-800">{roleTitle}</p>
                ) : null}
                {company ? (
                  <p className="mt-0.5 text-slate-600">{company}</p>
                ) : null}
              </div>
            )}

            {bio ? (
              <div className="text-sm leading-relaxed text-slate-600">
                <p className={bioExpanded ? "" : "line-clamp-3"}>{bio}</p>
                {bio.length > 140 ? (
                  <button
                    type="button"
                    onClick={() => setBioExpanded((v) => !v)}
                    className="mt-1 text-xs font-bold text-[var(--brand)] hover:underline"
                  >
                    {bioExpanded ? "Show less" : "More"}
                  </button>
                ) : null}
              </div>
            ) : null}

            {shownSkills.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-1.5">
                {shownSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex max-w-full truncate rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700"
                  >
                    {skill}
                  </span>
                ))}
                {extraSkills > 0 ? (
                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">
                    +{extraSkills} more
                  </span>
                ) : null}
              </div>
            ) : null}

            {openTo.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-1.5">
                {openTo.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex max-w-full truncate rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800"
                  >
                    Open to {tag}
                  </span>
                ))}
              </div>
            ) : null}

            {mentorAvailable && role === "Graduate" ? (
              <p className="text-center text-xs font-semibold text-teal-800">
                Available as mentor
              </p>
            ) : null}

            {linkedin ? (
              <div className="text-center">
                <a
                  href={linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--brand)] hover:underline"
                >
                  LinkedIn
                  <ExternalIcon />
                </a>
              </div>
            ) : null}

            <div className="space-y-2 border-t border-slate-100 pt-4">
              {isSelf ? (
                <Link
                  href="/profile"
                  onClick={closePreview}
                  className="btn-primary flex w-full items-center justify-center"
                >
                  Edit profile
                </Link>
              ) : (
                <>
                  {action.kind === "send_request" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setRequestTarget({
                          id: profile.id,
                          full_name: profile.full_name,
                        });
                      }}
                      className="btn-primary w-full"
                    >
                      {conversation?.status === "declined"
                        ? "Connect again"
                        : "Send Request"}
                    </button>
                  ) : null}

                  {action.kind === "request_sent" ? (
                    <button
                      type="button"
                      disabled
                      className="btn-primary w-full cursor-not-allowed opacity-55"
                    >
                      Request sent
                    </button>
                  ) : null}

                  {action.kind === "message" ? (
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        disabled={messageDisabled}
                        onClick={() => {
                          closePreview();
                          router.push(`/messages?with=${profile.id}`);
                        }}
                        className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-55"
                      >
                        Message
                      </button>
                      {messageDisabled ? (
                        <p className="text-center text-xs text-slate-500">
                          You&apos;ll be able to send another message once{" "}
                          {partnerFirst} replies.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {showAskHelp ? (
                    <Link
                      href="/mentors"
                      onClick={closePreview}
                      className="flex w-full items-center justify-center rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-sm font-semibold text-teal-800 transition hover:bg-teal-50"
                    >
                      Ask for help
                    </Link>
                  ) : null}
                </>
              )}
            </div>
          </div>
        ) : null}
      </AppModal>

      {requestTarget && viewerId ? (
        <ConnectionRequestModal
          open
          onClose={() => setRequestTarget(null)}
          currentUserId={viewerId}
          recipientId={requestTarget.id}
          recipientName={requestTarget.full_name}
          onSent={(recipientId) => {
            setConversation({
              id: `local-${recipientId}`,
              initiator_id: viewerId,
              recipient_id: recipientId,
              status: "pending",
              unlock_reason: null,
              intro_message_sent: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            setRequestTarget(null);
            closePreview();
            router.push(`/messages?with=${recipientId}`);
          }}
        />
      ) : null}
    </ProfilePreviewContext.Provider>
  );
}

type TriggerProps = {
  userId: string | null | undefined;
  /** When false, renders children without opening preview (e.g. anonymous). */
  enabled?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Wraps avatar/name so click opens the shared profile preview.
 * Stops propagation so row action buttons / links keep working.
 */
export function ProfilePreviewTrigger({
  userId,
  enabled = true,
  className = "",
  children,
}: TriggerProps) {
  const { openPreview } = useProfilePreviewOptional();
  const canOpen = Boolean(userId && enabled);

  if (!canOpen) {
    return <span className={className}>{children}</span>;
  }

  function activate(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (userId) openPreview(userId);
  }

  return (
    <button
      type="button"
      className={`cursor-pointer rounded-sm border-0 bg-transparent p-0 text-left outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-teal-500/40 ${className}`}
      onClick={activate}
      aria-label="View profile"
    >
      {children}
    </button>
  );
}

function PreviewSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="flex flex-col items-center gap-3">
        <div className="h-20 w-20 rounded-full bg-slate-200" />
        <div className="h-5 w-40 rounded bg-slate-200" />
        <div className="h-4 w-28 rounded bg-slate-100" />
      </div>
      <div className="mx-auto h-3 w-3/4 rounded bg-slate-100" />
      <div className="mx-auto h-3 w-2/3 rounded bg-slate-100" />
      <div className="flex justify-center gap-2 pt-2">
        <div className="h-6 w-16 rounded-full bg-slate-100" />
        <div className="h-6 w-20 rounded-full bg-slate-100" />
        <div className="h-6 w-14 rounded-full bg-slate-100" />
      </div>
      <div className="h-10 w-full rounded-xl bg-slate-200" />
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}
