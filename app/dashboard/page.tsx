import Link from "next/link";
import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { SuggestedPeople } from "@/components/suggested-people";
import {
  DashboardFeed,
  PeoplePreviewHeader,
} from "@/components/dashboard-feed";
import { PageShell } from "@/components/ui/page-shell";
import { SurfaceCard } from "@/components/ui/surface-card";
import {
  IconBriefcase,
  IconMessage,
  IconMentor,
  IconReferral,
  IconUsers,
} from "@/components/ui/icons";
import { getProfileCompletion } from "@/lib/profile-completion";
import {
  firstName,
  hasBatchYearPassed,
  isGraduateStatus,
  type NetworkProfile,
  type ProfileStatus,
} from "@/lib/network";
import { GraduationNudgeBanner } from "@/components/graduation-nudge-banner";
import type { ConversationRow } from "@/lib/conversations";
import {
  buildConversations,
  otherPartyId,
  type ChatPartner,
  type Message,
} from "@/lib/messages";
import {
  normalizeOpportunity,
  type Opportunity,
} from "@/lib/opportunities";
import type { ReactNode } from "react";

const PROFILE_SELECT =
  "id, full_name, batch_year, status, department, current_job, company, role_title, is_founder, open_to, skills, linkedin_url, avatar_url, bio";

export default async function DashboardPage() {
  const { user, supabase } = await requireProfile();

  const [
    { data: myProfile },
    { count: networkCount },
    { count: unreadCount },
    { data: messageRows },
    { data: opportunityRows },
    { data: conversationRows },
  ] = await Promise.all([
    supabase.from("profiles").select(PROFILE_SELECT).eq("id", user.id).single(),
    // Exclude self from network size
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .neq("id", user.id),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", user.id)
      .eq("read", false),
    supabase
      .from("messages")
      .select("id, sender_id, receiver_id, content, created_at, read")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: true }),
    supabase
      .from("opportunities")
      .select(
        "id, posted_by, type, title, company, description, apply_link, location, deadline, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("conversations")
      .select(
        "id, initiator_id, recipient_id, status, unlock_reason, intro_message_sent, created_at, updated_at",
      )
      .or(`initiator_id.eq.${user.id},recipient_id.eq.${user.id}`),
  ]);

  const profile = myProfile as NetworkProfile | null;
  const isGraduate = isGraduateStatus(profile?.status);

  let companyReferralAsks = 0;
  let waitingStudents: { count: number; maxAgeDays: number } | null = null;
  if (isGraduate) {
    const [{ count }, { data: matchedAskRows }] = await Promise.all([
      supabase
        .from("referral_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "open")
        .neq("student_id", user.id),
      supabase.rpc("list_my_matched_asks"),
    ]);
    // RLS can_view_referral already filters what this graduate can see
    companyReferralAsks = count ?? 0;

    const pending = (
      (matchedAskRows ?? []) as Record<string, unknown>[]
    ).filter((row) => row.match_status === "pending");
    if (pending.length > 0) {
      let maxAgeDays = 0;
      for (const row of pending) {
        const created = new Date(String(row.request_created_at ?? ""));
        if (Number.isNaN(created.getTime())) continue;
        const age =
          (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
        if (age > maxAgeDays) maxAgeDays = age;
      }
      if (maxAgeDays >= 1) {
        waitingStudents = {
          count: pending.length,
          maxAgeDays: Math.max(1, Math.floor(maxAgeDays)),
        };
      }
    }
  }

  const displayName = firstName(
    profile?.full_name ||
      (user.user_metadata?.full_name as string | undefined) ||
      user.email,
  );

  const completion = profile
    ? getProfileCompletion(profile)
    : {
        percent: 0,
        message: "Complete your profile to get started.",
        nextTip: null,
      };

  let sameDepartmentCount = 0;
  let sameBatchCount = 0;
  let suggestions: NetworkProfile[] = [];

  if (profile?.department?.trim()) {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("department", profile.department.trim())
      .neq("id", user.id);
    sameDepartmentCount = count ?? 0;
  }

  if (profile?.batch_year != null) {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("batch_year", profile.batch_year)
      .neq("id", user.id);
    sameBatchCount = count ?? 0;
  }

  const suggestionFilters: string[] = [];
  if (profile?.department?.trim()) {
    suggestionFilters.push(`department.eq.${profile.department.trim()}`);
  }
  if (profile?.batch_year != null) {
    suggestionFilters.push(`batch_year.eq.${profile.batch_year}`);
  }

  if (suggestionFilters.length > 0) {
    // Exclude self before .or — PostgREST can ignore trailing .not on .or filters.
    const { data } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .neq("id", user.id)
      .or(suggestionFilters.join(","))
      .limit(12);

    const rows = ((data ?? []) as NetworkProfile[]).filter(
      (row) => row.id !== user.id,
    );
    suggestions = rows
      .map((row) => {
        let score = 0;
        if (
          profile?.department?.trim() &&
          row.department?.trim() === profile.department.trim()
        ) {
          score += 2;
        }
        if (
          profile?.batch_year != null &&
          row.batch_year === profile.batch_year
        ) {
          score += 2;
        }
        return { row, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((item) => item.row);
  }

  const conversations = (conversationRows ?? []) as ConversationRow[];

  const messages = (messageRows ?? []) as Message[];
  const partnerIds = new Set<string>();
  for (const message of messages) {
    partnerIds.add(otherPartyId(message, user.id));
  }

  const partnersMap: Record<string, ChatPartner> = {};
  if (partnerIds.size > 0) {
    const { data: partnerRows } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", Array.from(partnerIds))
      .neq("id", user.id);
    for (const p of (partnerRows ?? []) as ChatPartner[]) {
      partnersMap[p.id] = p;
    }
  }

  const recentConversations = buildConversations(
    messages,
    partnersMap,
    user.id,
  ).slice(0, 3);

  const latestOpportunities = (opportunityRows ?? []).map((row) =>
    normalizeOpportunity(row as Record<string, unknown>),
  ) as Opportunity[];

  const tip =
    completion.nextTip?.replace(/^Add your /i, "") ||
    completion.message ||
    "complete your profile";

  const showGradNudge =
    (profile?.status as ProfileStatus | null | undefined) === "student" &&
    hasBatchYearPassed(profile?.batch_year ?? null);

  return (
    <PageShell accent="home">
      <Navbar />

      <main className="relative z-10 mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-4 pb-5 pt-5 sm:px-6 sm:pb-10 sm:pt-8">
        <div className="mb-4 min-w-0 animate-fade-up sm:mb-6">
          <p className="mb-1 text-sm font-semibold text-[var(--brand)]">
            Your home base
          </p>
          <h1 className="page-title break-safe">Welcome, {displayName}</h1>
          <p className="mt-1.5 max-w-xl text-sm text-[var(--muted)] sm:mt-2 sm:text-base">
            Catch up on people, messages, and openings from your college
            community.
          </p>
        </div>

        {showGradNudge && <GraduationNudgeBanner userId={user.id} />}

        {isGraduate && companyReferralAsks > 0 && (
          <Link
            href="/referrals"
            className="surface-card mb-4 flex min-w-0 items-center gap-3 overflow-hidden px-3 py-2.5 animate-fade-up hover:border-rose-200 sm:mb-6 sm:px-4"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-referrals-soft)] text-[var(--accent-referrals)]">
              <IconReferral size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">
                {companyReferralAsks} referral{" "}
                {companyReferralAsks === 1 ? "ask" : "asks"} waiting
                {profile?.company?.trim()
                  ? ` · including ${profile.company.trim()}`
                  : ""}
              </p>
              <p className="truncate text-xs text-slate-500">
                Open Referrals to ask a question or accept.
              </p>
            </div>
            <span className="shrink-0 text-xs font-bold text-[var(--accent-referrals)]">
              View →
            </span>
          </Link>
        )}

        {isGraduate && waitingStudents && (
          <Link
            href="/mentors"
            className="surface-card mb-4 flex min-w-0 items-center gap-3 overflow-hidden px-3 py-2.5 animate-fade-up hover:border-amber-200 sm:mb-6 sm:px-4"
          >
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-mentors-soft)] text-[var(--accent-mentors)]">
              <IconMentor size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">
                {waitingStudents.count} student
                {waitingStudents.count === 1 ? "" : "s"} still waiting —{" "}
                {waitingStudents.maxAgeDays} day
                {waitingStudents.maxAgeDays === 1 ? "" : "s"}
              </p>
              <p className="truncate text-xs text-slate-500">
                Open Mentors to accept or reply.
              </p>
            </div>
            <span className="shrink-0 text-xs font-bold text-[var(--accent-mentors)]">
              View →
            </span>
          </Link>
        )}

        {completion.percent < 100 && (
          <div className="surface-card mb-4 flex min-w-0 items-center gap-3 overflow-hidden px-3 py-2.5 animate-fade-up sm:mb-6 sm:gap-4 sm:px-4 sm:py-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <p className="shrink-0 text-xs font-bold text-slate-800 sm:text-sm">
                  {completion.percent}%
                </p>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-teal-50">
                  <div
                    className="h-full rounded-full bg-[var(--brand)]"
                    style={{ width: `${completion.percent}%` }}
                  />
                </div>
              </div>
              <p className="mt-1 truncate text-[11px] text-slate-500 sm:text-xs">
                Add {tip}
              </p>
            </div>
            <Link
              href="/profile"
              className="shrink-0 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--brand-dark)]"
            >
              Finish
            </Link>
          </div>
        )}

        {/* Compact stats: 4 equal tiles in one row — no min-width that blows past 375px */}
        <div className="mb-5 grid w-full min-w-0 max-w-full grid-cols-4 gap-1.5 animate-fade-up sm:gap-2 lg:mb-8 lg:gap-3">
          <StatTile
            href="/network"
            label="Network"
            value={networkCount ?? 0}
            icon={<IconUsers size={14} />}
            soft="var(--accent-network-soft)"
            solid="var(--accent-network)"
          />
          <StatTile
            href="/messages"
            label="Unread"
            value={unreadCount ?? 0}
            icon={<IconMessage size={14} />}
            soft="var(--accent-messages-soft)"
            solid="var(--accent-messages)"
            highlight={(unreadCount ?? 0) > 0}
          />
          <StatTile
            href="/network"
            label="Dept"
            value={sameDepartmentCount}
            icon={<IconBriefcase size={14} />}
            soft="var(--accent-opportunities-soft)"
            solid="var(--accent-opportunities)"
          />
          <StatTile
            href="/network"
            label="Batch"
            value={sameBatchCount}
            icon={<IconUsers size={14} />}
            soft="var(--accent-mentors-soft)"
            solid="var(--accent-mentors)"
          />
        </div>

        {/* Below-the-fold: force phone width — never expand into a desktop strip */}
        <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-5 overflow-x-clip lg:grid-cols-5 lg:gap-6 animate-fade-up">
          <section className="w-full min-w-0 max-w-full overflow-x-clip lg:col-span-3">
            <PeoplePreviewHeader />
            <SuggestedPeople
              profiles={suggestions}
              currentUserId={user.id}
              initialConversations={conversations}
              compact
              dense
              limit={4}
              mobileOnlyLimit
            />
          </section>

          <section className="w-full min-w-0 max-w-full overflow-x-clip lg:col-span-2">
            <DashboardFeed
              conversations={recentConversations}
              opportunities={latestOpportunities}
              currentUserId={user.id}
            />
          </section>
        </div>
      </main>
    </PageShell>
  );
}

function StatTile({
  href,
  label,
  value,
  icon,
  soft,
  solid,
  highlight = false,
}: {
  href: string;
  label: string;
  value: number;
  icon: ReactNode;
  soft: string;
  solid: string;
  highlight?: boolean;
}) {
  return (
    <Link href={href} className="block min-w-0 max-w-full">
      <SurfaceCard
        interactive
        className={`flex h-full min-w-0 max-w-full flex-col items-center overflow-hidden px-1 py-1.5 text-center sm:px-2 sm:py-2 lg:items-start lg:p-3.5 lg:text-left ${highlight ? "ring-1 ring-teal-500/25" : ""}`}
      >
        <div
          className="mb-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md lg:mb-2 lg:h-8 lg:w-8 lg:rounded-xl"
          style={{ background: soft, color: solid }}
        >
          {icon}
        </div>
        <p className="font-[family-name:var(--font-display)] text-base font-bold leading-none text-slate-900 lg:text-3xl">
          {value}
        </p>
        <p className="mt-0.5 max-w-full truncate text-[10px] font-semibold leading-tight text-slate-500 lg:text-xs">
          {label}
        </p>
      </SurfaceCard>
    </Link>
  );
}
