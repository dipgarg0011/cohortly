import Link from "next/link";
import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { SuggestedPeople } from "@/components/suggested-people";
import {
  DashboardFeed,
  DASHBOARD_PAIR_CARD_STRETCH,
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
import { MentorOnboardingCard } from "@/components/mentor-onboarding-card";
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
  type MentorshipRequest,
} from "@/lib/mentorship";
import { buildNeedsYouItems, NEEDS_BUBBLE_DETAIL_CAP } from "@/lib/dashboard-needs";
import {
  buildWorthALookItems,
  needExclusionSet,
} from "@/lib/dashboard-look";
import {
  COMMUNITY_SELECT,
  buildCommunityStats,
  type CommunityProfileRow,
} from "@/lib/dashboard-community";
import { loadDashboardSuggestions } from "@/lib/dashboard-suggestions";
import {
  CONVERSATION_SELECT,
  conversationLabelFromRow,
  partnerIdFromConversation,
  type ConversationRow,
} from "@/lib/conversations";
import { listLabelForConversation } from "@/lib/conversation-context";

const PROFILE_SELECT =
  "id, full_name, batch_year, status, department, current_job, company, role_title, is_founder, open_to, skills, linkedin_url, avatar_url, bio";

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
    { data: referralDismissalRows },
    { data: applicationRows },
    { data: communityRows },
    { data: mentorAvailability },
  ] = await Promise.all([
    supabase.from("profiles").select(PROFILE_SELECT).eq("id", user.id).single(),
    supabase
      .from("messages")
      .select(
        "id, sender_id, receiver_id, content, created_at, read, is_system, message_kind",
      )
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
      .in("status", ["in_progress", "accepted"])
      .is("referred_at", null)
      .order("accepted_at", { ascending: true })
      .limit(10),
    supabase
      .from("referral_dismissals")
      .select("request_id")
      .eq("user_id", user.id),
    supabase
      .from("opportunity_applications")
      .select(
        `
        id, opportunity_id, applicant_id, pitch, resume_url, status, outcome, stage_updated_at, created_at,
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
    // Mentors must not SELECT mentorship_requests directly (unmatched leak /
    // student_id exposure). Matched asks come from list_my_matched_asks above.
    supabase.from("profiles").select(COMMUNITY_SELECT),
    supabase
      .from("mentor_availability")
      .select("onboarding_state, is_available")
      .eq("mentor_id", user.id)
      .maybeSingle(),
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

  const conversations = (conversationRows ?? []) as ConversationRow[];
  const messages = (messageRows ?? []) as Message[];

  const { profiles: suggestions, note: suggestionsNote } =
    await loadDashboardSuggestions({
      supabase,
      profileSelect: PROFILE_SELECT,
      uid: user.id,
      profile,
      conversations,
      limit: 4,
    });

  const showPeopleColumn = suggestions.length > 0;

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
  const dismissedReferralIds = new Set(
    ((referralDismissalRows ?? []) as { request_id: string }[]).map(
      (row) => row.request_id,
    ),
  );
  const pendingApplications = (
    (applicationRows ?? []) as Record<string, unknown>[]
  ).map((row) => normalizeApplication(row));
  // Do not list unmatched mentorship asks on the dashboard (RLS + privacy).
  const openMentorshipAsks: MentorshipRequest[] = [];

  const needItems = buildNeedsYouItems({
    currentUserId: user.id,
    conversations,
    messages,
    partners: partnersMap,
    matchedAsks,
    openReferrals,
    pendingApplications,
    dismissedReferralIds,
    viewerCompany: profile?.company ?? null,
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
    needsIds: needExclusionSet(needItems.slice(0, NEEDS_BUBBLE_DETAIL_CAP)),
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

  // Labels for mentorship / referral / opportunity threads in the feed.
  const conversationLabels: Record<string, string> = {};
  for (const conv of conversations) {
    const partner = partnerIdFromConversation(conv, user.id);
    const label =
      listLabelForConversation(conv) ?? conversationLabelFromRow(conv);
    if (label) conversationLabels[partner] = label;
  }

  // Enrich referral / opportunity labels when snapshot detail is thin.
  for (const ref of [...acceptedReferrals, ...openReferrals]) {
    const otherId =
      ref.student_id === user.id
        ? ref.accepted_by ?? ref.helper_id
        : ref.student_id;
    if (!otherId || conversationLabels[otherId]?.includes(" · ")) continue;
    const conv = conversations.find(
      (c) =>
        (c.unlock_reason === "referral" ||
          c.unlock_reason === "referral_question" ||
          c.context_type === "referral" ||
          c.context_type === "referral_question") &&
        partnerIdFromConversation(c, user.id) === otherId,
    );
    if (!conv) continue;
    const label = listLabelForConversation({
      ...conv,
      context_snapshot: {
        ...(typeof conv.context_snapshot === "object" && conv.context_snapshot
          ? conv.context_snapshot
          : {}),
        company: ref.company,
        role: ref.role,
      },
    });
    if (label) conversationLabels[otherId] = label;
  }
  for (const app of pendingApplications) {
    const applicantId = app.applicant_id;
    if (conversationLabels[applicantId]?.includes(" · ")) continue;
    const title = app.opportunity?.title;
    const company = app.opportunity?.company;
    const label = listLabelForConversation({
      id: "",
      initiator_id: applicantId,
      recipient_id: user.id,
      status: "accepted",
      unlock_reason: "opportunity_application",
      context_type: "opportunity",
      intro_message_sent: true,
      created_at: "",
      updated_at: "",
      context_snapshot: { title, company, role: title },
    });
    if (label) conversationLabels[applicantId] = label;
  }

  const latestOpportunities = recentOpportunities.slice(0, 4);

  const showGradNudge =
    (profile?.status as ProfileStatus | null | undefined) === "student" &&
    hasBatchYearPassed(profile?.batch_year ?? null);

  const showMentorOnboarding =
    (profile?.status as ProfileStatus | null | undefined) === "graduate" &&
    (mentorAvailability?.onboarding_state ?? "not_asked") === "not_asked";

  const communityStats = buildCommunityStats(
    (communityRows ?? []) as CommunityProfileRow[],
    {
      batch_year: profile?.batch_year ?? null,
      department: profile?.department ?? null,
    },
  );

  // Profile tip stays below the fold — never inside the Needs bubble.
  const showProfileTipBanner =
    completion.percent < 100 && Boolean(completion.nextTip);

  return (
    <PageShell accent="home">
      <Navbar />

      <main className="relative z-10 mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-5 pt-5 sm:px-6 sm:pb-10 sm:pt-8">
        <div className="mb-5 flex min-w-0 flex-col gap-3 stagger-1 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <h1 className="page-title break-safe">Welcome, {displayName}</h1>
          <DashboardNeedsYou items={needItems} currentUserId={user.id} />
        </div>

        {showGradNudge && <GraduationNudgeBanner userId={user.id} />}

        {showMentorOnboarding ? (
          <MentorOnboardingCard mentorId={user.id} />
        ) : null}

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

        <div
          className={`grid w-full min-w-0 max-w-full grid-cols-1 gap-5 ${
            showPeopleColumn
              ? "lg:grid-cols-2 lg:items-stretch"
              : "lg:grid-cols-1"
          }`}
        >
          {showPeopleColumn && (
            <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col">
              <SectionCard stagger={3} className={DASHBOARD_PAIR_CARD_STRETCH}>
                <div className={DASHBOARD_PAIR_HEADER}>
                  <PeoplePreviewHeader />
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto px-3 py-3 sm:px-4 sm:py-3.5">
                  {suggestionsNote ? (
                    <p className="mb-2.5 text-xs leading-snug text-slate-500">
                      {suggestionsNote}
                    </p>
                  ) : null}
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

          <div className="flex min-h-0 w-full min-w-0 max-w-full flex-col">
            <DashboardFeed
              conversations={recentConversations}
              opportunities={latestOpportunities}
              currentUserId={user.id}
              stretchToPair={showPeopleColumn}
              conversationLabels={conversationLabels}
            />
          </div>
        </div>
      </main>
    </PageShell>
  );
}
