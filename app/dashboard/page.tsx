import Link from "next/link";
import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { SuggestedPeople } from "@/components/suggested-people";
import { PageShell } from "@/components/ui/page-shell";
import { SurfaceCard } from "@/components/ui/surface-card";
import {
  IconBriefcase,
  IconMentor,
  IconMessage,
  IconReferral,
  IconUsers,
} from "@/components/ui/icons";
import { getProfileCompletion } from "@/lib/profile-completion";
import { firstName, getInitials, type NetworkProfile } from "@/lib/network";
import type { ConversationRow } from "@/lib/conversations";
import {
  buildConversations,
  formatMessageTime,
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
    { count: unreadCount },
    { data: messageRows },
    { data: opportunityRows },
    { data: conversationRows },
    { count: pendingRequests },
  ] = await Promise.all([
    supabase.from("profiles").select(PROFILE_SELECT).eq("id", user.id).single(),
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
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .eq("status", "pending"),
  ]);

  const profile = myProfile as NetworkProfile | null;
  const first = firstName(
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

  let suggestions: NetworkProfile[] = [];
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
      .slice(0, 3)
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

  const features: {
    href: string;
    title: string;
    blurb: string;
    icon: ReactNode;
    soft: string;
    solid: string;
    badge?: number;
  }[] = [
    {
      href: "/network",
      title: "Network",
      blurb: "Find people and send a request",
      icon: <IconUsers size={22} />,
      soft: "var(--accent-network-soft)",
      solid: "var(--accent-network)",
    },
    {
      href: "/mentors",
      title: "Mentors",
      blurb: "Ask for help or reply to asks",
      icon: <IconMentor size={22} />,
      soft: "var(--accent-mentors-soft)",
      solid: "var(--accent-mentors)",
    },
    {
      href: "/messages",
      title: "Messages",
      blurb: "Chats and connection requests",
      icon: <IconMessage size={22} />,
      soft: "var(--accent-messages-soft)",
      solid: "var(--accent-messages)",
      badge: (unreadCount ?? 0) + (pendingRequests ?? 0),
    },
    {
      href: "/referrals",
      title: "Referrals",
      blurb: "Request or help with referrals",
      icon: <IconReferral size={22} />,
      soft: "var(--accent-referrals-soft)",
      solid: "var(--accent-referrals)",
    },
    {
      href: "/opportunities",
      title: "Opportunities",
      blurb: "Internships, jobs, and roles",
      icon: <IconBriefcase size={22} />,
      soft: "var(--accent-opportunities-soft)",
      solid: "var(--accent-opportunities)",
    },
  ];

  return (
    <PageShell accent="home">
      <Navbar />

      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        {/* Center welcome card */}
        <SurfaceCard className="mx-auto mb-8 overflow-hidden p-0 animate-fade-up">
          <div className="bg-gradient-to-br from-teal-50 via-white to-amber-50/40 px-6 py-8 text-center sm:px-10 sm:py-10">
            <p className="text-sm font-semibold text-[var(--brand)]">
              Cohortly
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Hi, {first}
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--muted)] sm:text-base">
              Your college community — connect, ask mentors, and find
              opportunities in one place.
            </p>

            {completion.percent < 100 && (
              <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-teal-900/10 bg-white/80 px-4 py-3 text-left">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-800">
                    Profile {completion.percent}%
                  </p>
                  <Link
                    href="/profile"
                    className="text-xs font-bold text-[var(--brand)] hover:underline"
                  >
                    Finish →
                  </Link>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-teal-50">
                  <div
                    className="h-full rounded-full bg-[var(--brand)]"
                    style={{ width: `${completion.percent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </SurfaceCard>

        {/* Feature cards — everything functional */}
        <section className="mb-10 animate-fade-up">
          <h2 className="mb-3 text-center text-sm font-bold uppercase tracking-wide text-slate-500">
            What do you want to do?
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {features.map((f) => (
              <li key={f.href} className={f.href === "/opportunities" ? "sm:col-span-2" : ""}>
                <Link href={f.href} className="block h-full">
                  <SurfaceCard
                    interactive
                    className="flex h-full items-start gap-3.5 p-4 sm:p-5"
                  >
                    <span
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                      style={{ background: f.soft, color: f.solid }}
                    >
                      {f.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="card-title">{f.title}</span>
                        {f.badge != null && f.badge > 0 && (
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--brand)] px-1.5 text-[10px] font-bold text-white">
                            {f.badge > 9 ? "9+" : f.badge}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-sm text-[var(--muted)]">
                        {f.blurb}
                      </span>
                    </span>
                  </SurfaceCard>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* People nearby */}
        <section className="mb-10 animate-fade-up">
          <div className="mb-4 text-center">
            <h2 className="section-title">People nearby</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              From your department or batch — send a request to connect.
            </p>
          </div>
          <SuggestedPeople
            profiles={suggestions}
            currentUserId={user.id}
            initialConversations={
              (conversationRows ?? []) as ConversationRow[]
            }
            compact
          />
          <div className="mt-4 text-center">
            <Link
              href="/network"
              className="text-sm font-bold text-[var(--brand)] hover:underline"
            >
              Browse full network →
            </Link>
          </div>
        </section>

        {/* Simple recent activity */}
        <section className="animate-fade-up">
          <div className="mb-4 text-center">
            <h2 className="section-title">Recent</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SurfaceCard className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">Messages</h3>
                <Link
                  href="/messages"
                  className="text-xs font-bold text-[var(--brand)] hover:underline"
                >
                  Open
                </Link>
              </div>
              {recentConversations.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No chats yet. Connect with someone in Network.
                </p>
              ) : (
                <ul className="space-y-2">
                  {recentConversations.map((c) => (
                    <li key={c.partner.id}>
                      <Link
                        href={`/messages?with=${c.partner.id}`}
                        className="flex items-center gap-2.5 rounded-xl px-1 py-1.5 transition hover:bg-teal-50/80"
                      >
                        <MiniAvatar
                          name={c.partner.full_name}
                          url={c.partner.avatar_url}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">
                            {c.partner.full_name?.trim() || "Member"}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {c.lastMessage.content}
                          </span>
                        </span>
                        <span className="meta-text shrink-0">
                          {formatMessageTime(c.lastMessage.created_at)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SurfaceCard>

            <SurfaceCard className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-800">
                  Opportunities
                </h3>
                <Link
                  href="/opportunities"
                  className="text-xs font-bold text-[var(--brand)] hover:underline"
                >
                  Open
                </Link>
              </div>
              {latestOpportunities.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No openings posted yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {latestOpportunities.map((item) => (
                    <li key={item.id}>
                      <Link
                        href="/opportunities"
                        className="block rounded-xl px-1 py-1.5 transition hover:bg-indigo-50/70"
                      >
                        <span className="text-[11px] font-bold text-indigo-700">
                          {item.type}
                        </span>
                        <span className="mt-0.5 block truncate text-sm font-semibold text-slate-900">
                          {item.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SurfaceCard>
          </div>
        </section>
      </main>
    </PageShell>
  );
}

function MiniAvatar({
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
        className="h-8 w-8 shrink-0 rounded-full object-cover ring-2 ring-teal-100"
      />
    );
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[10px] font-bold text-teal-800">
      {getInitials(name)}
    </div>
  );
}
