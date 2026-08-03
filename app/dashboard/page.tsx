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
  IconUsers,
} from "@/components/ui/icons";
import { getProfileCompletion } from "@/lib/profile-completion";
import { type NetworkProfile } from "@/lib/network";
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
  "id, full_name, batch_year, department, current_job, company, role_title, is_founder, open_to, skills, linkedin_url, avatar_url, bio";

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
    supabase.from("profiles").select("id", { count: "exact", head: true }),
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
  const displayName =
    profile?.full_name ||
    (user.user_metadata?.full_name as string | undefined) ||
    user.email ||
    "there";

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
    const { data } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .or(suggestionFilters.join(","))
      .neq("id", user.id)
      .limit(12);

    const rows = (data ?? []) as NetworkProfile[];
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
      .slice(0, 4)
      .map((item) => item.row);
  }

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
      .in("id", Array.from(partnerIds));
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

  return (
    <PageShell accent="home">
      <Navbar />

      <main className="relative z-10 mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-3 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 animate-fade-up">
          <p className="mb-1 text-sm font-semibold text-[var(--brand)]">
            Your home base
          </p>
          <h1 className="page-title break-safe">Welcome, {displayName}</h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--muted)] sm:text-base">
            Catch up on people, messages, and openings from your college
            community.
          </p>
        </div>

        {completion.percent < 100 && (
          <div className="surface-card mb-6 flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-5 animate-fade-up">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-800">
                  Profile {completion.percent}% complete
                </p>
                <span className="meta-text hidden sm:inline">
                  {completion.nextTip}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-teal-50">
                <div
                  className="h-full rounded-full bg-[var(--brand)] transition-all"
                  style={{ width: `${completion.percent}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-500 sm:hidden">
                {completion.message}
              </p>
            </div>
            <Link href="/profile" className="btn-primary shrink-0">
              Finish profile
            </Link>
          </div>
        )}

        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4 animate-fade-up">
          <StatTile
            href="/network"
            label="In the network"
            value={networkCount ?? 0}
            icon={<IconUsers size={16} />}
            soft="var(--accent-network-soft)"
            solid="var(--accent-network)"
          />
          <StatTile
            href="/messages"
            label="Unread"
            value={unreadCount ?? 0}
            icon={<IconMessage size={16} />}
            soft="var(--accent-messages-soft)"
            solid="var(--accent-messages)"
            highlight={(unreadCount ?? 0) > 0}
          />
          <StatTile
            href="/network"
            label="Same department"
            value={sameDepartmentCount}
            icon={<IconBriefcase size={16} />}
            soft="var(--accent-opportunities-soft)"
            solid="var(--accent-opportunities)"
            sublabel={profile?.department?.trim() || undefined}
          />
          <StatTile
            href="/network"
            label="Same batch"
            value={sameBatchCount}
            icon={<IconUsers size={16} />}
            soft="var(--accent-mentors-soft)"
            solid="var(--accent-mentors)"
            sublabel={
              profile?.batch_year != null
                ? `Batch ${profile.batch_year}`
                : undefined
            }
          />
        </div>

        <div className="grid min-w-0 gap-6 lg:grid-cols-5 animate-fade-up">
          <section className="min-w-0 lg:col-span-3">
            <PeoplePreviewHeader />
            <SuggestedPeople
              profiles={suggestions}
              currentUserId={user.id}
              initialConversations={
                (conversationRows ?? []) as ConversationRow[]
              }
              compact
            />
            <div className="mt-3 sm:hidden">
              <Link
                href="/network"
                className="text-sm font-bold text-[var(--brand)] hover:underline"
              >
                View all in Network →
              </Link>
            </div>
          </section>

          <section className="min-w-0 lg:col-span-2">
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
  sublabel,
  highlight = false,
}: {
  href: string;
  label: string;
  value: number;
  icon: ReactNode;
  soft: string;
  solid: string;
  sublabel?: string;
  highlight?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <SurfaceCard
        interactive
        className={`h-full p-3.5 sm:p-4 ${highlight ? "ring-1 ring-teal-500/25" : ""}`}
      >
        <div
          className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-xl"
          style={{ background: soft, color: solid }}
        >
          {icon}
        </div>
        <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900 sm:text-3xl">
          {value}
        </p>
        <p className="mt-0.5 text-xs font-semibold text-slate-500">{label}</p>
        {sublabel && (
          <p className="mt-1 truncate text-[11px] font-medium" style={{ color: solid }}>
            {sublabel}
          </p>
        )}
      </SurfaceCard>
    </Link>
  );
}
