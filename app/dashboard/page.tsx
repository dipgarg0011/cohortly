import Link from "next/link";
import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { SuggestedPeople } from "@/components/suggested-people";
import {
  DashboardFeed,
  DASHBOARD_PAIR_CARD,
  DASHBOARD_PAIR_FOOTER,
  DASHBOARD_PAIR_HEADER,
  PeoplePreviewHeader,
} from "@/components/dashboard-feed";
import { DashboardNeedsYou } from "@/components/dashboard-needs";
import { DashboardWorthALook } from "@/components/dashboard-worth-a-look";
import { DashboardCommunity } from "@/components/dashboard-community";
import { PageShell } from "@/components/ui/page-shell";
import { SectionCard } from "@/components/ui/section-card";
import { getProfileCompletion } from "@/lib/profile-completion";
import {
  firstName,
  hasBatchYearPassed,
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
  normalizeApplication,
  normalizeOpportunity,
  type Opportunity,
} from "@/lib/opportunities";
import {
  REFERRAL_SELECT,
  normalizeReferralRequest,
} from "@/lib/referrals";
import {
  normalizeMatchedAsk,
  normalizeMentorshipRequest,
} from "@/lib/mentorship";
import { buildNeedsYouItems } from "@/lib/dashboard-needs";
import {
  buildWorthALookItems,
  needExclusionSet,
} from "@/lib/dashboard-look";
import {
  COMMUNITY_SELECT,
  buildCommunityStats,
  type CommunityProfileRow,
} from "@/lib/dashboard-community";
import { pickCaughtUpNudge } from "@/lib/dashboard-nudge";

const PROFILE_SELECT =
  "id, full_name, batch_year, status, department, current_job, company, role_title, is_founder, open_to, skills, linkedin_url, avatar_url, bio";

const CONVERSATION_SELECT =
  "id, initiator_id, recipient_id, status, unlock_reason, intro_message_sent, created_at, updated_at, gate_mode, turn_holder, reply_count_by_recipient, gate_lifted_at, gate_student_id, turn_nudge_sent_at";

export default async function DashboardPage() {
  const { user, supabase } = await requireProfile();

  const [
    { data: myProfile },
    { data: messageRows },
    { data: opportunityRows },
    { data: conversationRows },
    { data: matchedAskRows },
    { data: openReferralRows },
    { data: acceptedReferralRows },
    { data: applicationRows },
    { data: openMentorshipRows },
    { data: communityRows },
  ] = await Promise.all([
    supabase.from("profiles").select(PROFILE_SELECT).eq("id", user.id).single(),
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
      .limit(20),
    supabase
      .from("conversations")
      .select(CONVERSATION_SELECT)
      .or(`initiator_id.eq.${user.id},recipient_id.eq.${user.id}`),
    supabase.rpc("list_my_matched_asks"),
    supabase
      .from("referral_requests")
      .select(REFERRAL_SELECT)
      .eq("status", "open")
      .neq("student_id", user.id)
      .order("created_at", { ascending: true })
      .limit(15),
    supabase
      .from("referral_requests")
      .select(REFERRAL_SELECT)
      .eq("accepted_by", user.id)
      .eq("status", "accepted")
      .is("referred_at", null)
      .order("accepted_at", { ascending: true })
      .limit(10),
    supabase
      .from("opportunity_applications")
      .select(
        `
        id, opportunity_id, applicant_id, pitch, resume_url, status, created_at,
        opportunity:opportunities!inner (
          id, posted_by, type, title, company, description, apply_link, location, deadline, created_at
        ),
        applicant:profiles!applicant_id (
          id, full_name, batch_year, department, skills, avatar_url
        )
      `,
      )
      .eq("status", "pending")
      .eq("opportunity.posted_by", user.id)
      .order("created_at", { ascending: true })
      .limit(15),
    supabase
      .from("mentorship_requests")
      .select(
        "id, student_id, title, description, tags, category, target_company, urgency, preferred_duration, status, expires_at, created_at, is_anonymous, revealed_at, quality_score, reach_stage, last_escalated_at",
      )
      .eq("status", "open")
      .neq("student_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("profiles").select(COMMUNITY_SELECT),
  ]);

  const profile = myProfile as NetworkProfile | null;

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
        nextTip: null as string | null,
      };

  // Suggestions: exclude self inside each OR branch (PostgREST-safe).
  let suggestions: NetworkProfile[] = [];
  const uid = user.id;
  const branches: string[] = [];
  const quote = (value: string) => {
    if (/^[A-Za-z0-9._-]+$/.test(value)) return value;
    return `"${value.replace(/"/g, '\\"')}"`;
  };
  if (profile?.department?.trim()) {
    branches.push(
      `and(department.eq.${quote(profile.department.trim())},id.neq.${uid})`,
    );
  }
  if (profile?.batch_year != null) {
    branches.push(`and(batch_year.eq.${profile.batch_year},id.neq.${uid})`);
  }
  if (branches.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .or(branches.join(","))
      .limit(12);

    const rows = (data ?? []) as NetworkProfile[];
    // Belt-and-suspenders: never surface the logged-in user even if OR
    // filter parsing drops an id.neq branch.
    suggestions = rows
      .filter((row) => row.id !== uid)
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
      .slice(0, 4)
      .map((item) => item.row);
  }

  const conversations = (conversationRows ?? []) as ConversationRow[];
  const messages = (messageRows ?? []) as Message[];

  const partnerIds = new Set<string>();
  for (const message of messages) {
    partnerIds.add(otherPartyId(message, user.id));
  }
  for (const conv of conversations) {
    if (conv.initiator_id !== user.id) partnerIds.add(conv.initiator_id);
    if (conv.recipient_id !== user.id) partnerIds.add(conv.recipient_id);
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

  const matchedAsks = ((matchedAskRows ?? []) as Record<string, unknown>[]).map(
    (row) => normalizeMatchedAsk(row),
  );
  const openReferrals = ((openReferralRows ?? []) as Record<string, unknown>[]).map(
    (row) => normalizeReferralRequest(row),
  );
  const acceptedReferrals = (
    (acceptedReferralRows ?? []) as Record<string, unknown>[]
  ).map((row) => normalizeReferralRequest(row));
  const pendingApplications = (
    (applicationRows ?? []) as Record<string, unknown>[]
  ).map((row) => normalizeApplication(row));
  const openMentorshipAsks = (
    (openMentorshipRows ?? []) as Record<string, unknown>[]
  ).map((row) => normalizeMentorshipRequest(row));

  const needItems = buildNeedsYouItems({
    currentUserId: user.id,
    conversations,
    messages,
    partners: partnersMap,
    matchedAsks,
    openReferrals,
    pendingApplications,
    acceptedReferrals,
  });

  const recentOpportunities = (opportunityRows ?? []).map((row) =>
    normalizeOpportunity(row as Record<string, unknown>),
  ) as Opportunity[];

  const lookItems = buildWorthALookItems({
    currentUserId: user.id,
    department: profile?.department ?? null,
    skills: profile?.skills ?? null,
    company: profile?.company ?? null,
    batchYear: profile?.batch_year ?? null,
    needsIds: needExclusionSet(needItems.slice(0, 5)),
    recentOpportunities,
    openReferrals,
    openMentorshipAsks,
    newMembers: [], // profiles have no reliable created_at in schema
  });

  const recentConversations = buildConversations(
    messages,
    partnersMap,
    user.id,
  ).slice(0, 4);

  const latestOpportunities = recentOpportunities.slice(0, 4);

  const showGradNudge =
    (profile?.status as ProfileStatus | null | undefined) === "student" &&
    hasBatchYearPassed(profile?.batch_year ?? null);

  const communityStats = buildCommunityStats(
    (communityRows ?? []) as CommunityProfileRow[],
    {
      batch_year: profile?.batch_year ?? null,
      department: profile?.department ?? null,
    },
  );

  // Optional: profiles.created_at may be missing on older schemas — ignore errors.
  let newBranchJoins = 0;
  const dept = profile?.department?.trim();
  if (dept) {
    const weekAgoIso = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { count, error: joinError } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("department", dept)
      .gte("created_at", weekAgoIso)
      .neq("id", user.id);
    if (!joinError && typeof count === "number") {
      newBranchJoins = count;
    }
  }

  const emptySuggestion =
    needItems.length === 0
      ? pickCaughtUpNudge({
          profile,
          newBranchJoins,
          department: profile?.department ?? null,
        })
      : null;

  // Never show profile tip banner alongside the caught-up suggested action.
  const showProfileTipBanner =
    needItems.length > 0 &&
    completion.percent < 100 &&
    Boolean(completion.nextTip);

  return (
    <PageShell accent="home">
      <Navbar />

      <main className="relative z-10 mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-4 pb-5 pt-5 sm:px-6 sm:pb-10 sm:pt-8">
        <div className="mb-5 min-w-0 stagger-1 sm:mb-6">
          <h1 className="page-title break-safe">Welcome, {displayName}</h1>
        </div>

        {showGradNudge && <GraduationNudgeBanner userId={user.id} />}

        <DashboardNeedsYou
          items={needItems}
          emptySuggestion={emptySuggestion}
        />

        <DashboardCommunity stats={communityStats} />

        <DashboardWorthALook items={lookItems} />

        {showProfileTipBanner && (
          <div className="@container/tip mb-5 sm:mb-6">
            <SectionCard
              stagger={3}
              className="flex min-w-0 flex-col items-stretch gap-2 @[24rem]/tip:flex-row @[24rem]/tip:items-center @[24rem]/tip:justify-between @[24rem]/tip:gap-3"
            >
              <p className="min-w-0 flex-1 line-clamp-2 text-sm leading-snug text-slate-600">
                {completion.nextTip}
              </p>
              <Link
                href="/profile"
                className="shrink-0 self-start text-sm font-bold text-[var(--brand)] hover:underline @[24rem]/tip:self-center"
              >
                Edit profile →
              </Link>
            </SectionCard>
          </div>
        )}

        <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-5 overflow-x-clip lg:grid-cols-2 lg:items-stretch">
          {suggestions.length > 0 && (
            <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col">
              <SectionCard stagger={3} className={DASHBOARD_PAIR_CARD}>
                <div className={DASHBOARD_PAIR_HEADER}>
                  <PeoplePreviewHeader />
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto px-3 py-3 sm:px-4 sm:py-3.5">
                  <SuggestedPeople
                    profiles={suggestions}
                    currentUserId={user.id}
                    initialConversations={conversations}
                    compact
                    dense
                    limit={4}
                  />
                </div>
                <div className={DASHBOARD_PAIR_FOOTER}>
                  <Link
                    href="/network"
                    className="text-sm font-bold text-[var(--brand)] hover:underline"
                  >
                    See all →
                  </Link>
                </div>
              </SectionCard>
            </div>
          )}

          <div
            className={`flex h-full min-h-0 w-full min-w-0 max-w-full flex-col ${
              suggestions.length > 0 ? "" : "lg:col-span-2"
            }`}
          >
            <DashboardFeed
              conversations={recentConversations}
              opportunities={latestOpportunities}
              currentUserId={user.id}
            />
          </div>
        </div>
      </main>
    </PageShell>
  );
}
