import type { MentorshipRequest } from "@/lib/mentorship";
import type { Opportunity } from "@/lib/opportunities";
import type { ReferralRequest } from "@/lib/referrals";
import type { NetworkProfile } from "@/lib/network";
import type { NeedItem } from "@/lib/dashboard-needs";

export type LookItem = {
  id: string;
  text: string;
  href: string;
  actionLabel: string;
};

function skillOverlap(a: string[] | null | undefined, b: string[] | null | undefined) {
  if (!a?.length || !b?.length) return 0;
  const set = new Set(a.map((s) => s.toLowerCase()));
  return b.filter((s) => set.has(s.toLowerCase())).length;
}

function firstName(name: string | null | undefined, fallback = "Someone"): string {
  const trimmed = name?.trim();
  if (!trimmed) return fallback;
  return trimmed.split(/\s+/)[0] ?? fallback;
}

export function buildWorthALookItems(input: {
  currentUserId: string;
  department: string | null;
  skills: string[] | null;
  company: string | null;
  batchYear: number | null;
  needsIds: Set<string>;
  recentOpportunities: Opportunity[];
  openReferrals: ReferralRequest[];
  openMentorshipAsks: MentorshipRequest[];
  newMembers: NetworkProfile[];
}): LookItem[] {
  const {
    currentUserId,
    department,
    skills,
    company,
    needsIds,
    recentOpportunities,
    openReferrals,
    openMentorshipAsks,
    newMembers,
  } = input;

  const items: LookItem[] = [];
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const dept = department?.trim().toLowerCase() ?? "";

  for (const opp of recentOpportunities) {
    if (opp.posted_by === currentUserId) continue;
    const created = new Date(opp.created_at).getTime();
    if (Number.isNaN(created) || created < weekAgo) continue;

    const blob = `${opp.title} ${opp.description ?? ""} ${opp.company ?? ""}`.toLowerCase();
    const deptMatch = Boolean(dept && blob.includes(dept));
    const skillMatch = (skills ?? []).some((s) =>
      blob.includes(s.toLowerCase()),
    );
    const relevant = deptMatch || skillMatch;
    // Only surface when we have a real dept/skills signal match
    if (!relevant) continue;

    const title = opp.title.trim() || "New opportunity";
    items.push({
      id: `opp:${opp.id}`,
      text: `${title}${opp.company?.trim() ? ` · ${opp.company.trim()}` : ""}`,
      href: "/opportunities",
      actionLabel: "View",
    });
    if (items.length >= 3) return items.slice(0, 3);
  }

  const companyNorm = company?.trim().toLowerCase() ?? "";
  if (companyNorm) {
    for (const ref of openReferrals) {
      if (ref.student_id === currentUserId) continue;
      if (ref.status !== "open") continue;
      if (needsIds.has(`referral:${ref.id}`)) continue;
      if (ref.company.trim().toLowerCase() !== companyNorm) continue;
      const name = firstName(ref.student?.full_name);
      items.push({
        id: `look-ref:${ref.id}`,
        text: `${name} needs a referral at ${ref.company.trim()}`,
        href: "/referrals",
        actionLabel: "Look",
      });
      if (items.length >= 3) return items.slice(0, 3);
    }
  }

  for (const ask of openMentorshipAsks) {
    if (ask.student_id === currentUserId) continue;
    if (ask.status !== "open") continue;
    if (skillOverlap(skills, ask.tags) === 0 && !(skills?.length)) continue;
    if (skills?.length && skillOverlap(skills, ask.tags) === 0) continue;
    items.push({
      id: `look-mentor:${ask.id}`,
      text: `Open mentorship ask: ${ask.title.trim() || "Untitled"}`,
      href: "/mentors",
      actionLabel: "Open",
    });
    if (items.length >= 3) return items.slice(0, 3);
  }

  for (const member of newMembers) {
    if (member.id === currentUserId) continue;
    const name = firstName(member.full_name, "A classmate");
    const where =
      member.department?.trim() ||
      (member.batch_year != null ? `Batch ${member.batch_year}` : "your cohort");
    items.push({
      id: `look-member:${member.id}`,
      text: `${name} joined ${where}`,
      href: `/network`,
      actionLabel: "Say hi",
    });
    if (items.length >= 3) break;
  }

  return items.slice(0, 3);
}

/** Map need items into an exclusion set for Worth a look. */
export function needExclusionSet(needs: NeedItem[]): Set<string> {
  return new Set(needs.map((n) => n.id));
}
