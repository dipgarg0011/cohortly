import type { SupabaseClient } from "@supabase/supabase-js";
import {
  connectionActionFor,
  findConversationWith,
  type ConversationRow,
} from "@/lib/conversations";
import type { NetworkProfile } from "@/lib/network";

export type SuggestionBundle = {
  profiles: NetworkProfile[];
  /** Shown when we fell back beyond batch/branch matches. */
  note: string | null;
};

function scoreRow(
  row: NetworkProfile,
  profile: NetworkProfile | null,
): number {
  let score = 0;
  if (
    profile?.department?.trim() &&
    row.department?.trim() === profile.department.trim()
  ) {
    score += 2;
  }
  if (profile?.batch_year != null && row.batch_year === profile.batch_year) {
    score += 2;
  }
  if (row.status === "graduate") score += 1;
  return score;
}

function filterVisible(
  rows: NetworkProfile[],
  uid: string,
  conversations: ConversationRow[],
): NetworkProfile[] {
  return rows.filter((row) => {
    if (row.id === uid) return false;
    const conv = findConversationWith(conversations, uid, row.id);
    // Only people you can still Connect with (not already messaging / pending)
    return connectionActionFor(conv).kind === "send_request";
  });
}

function rankTake(
  rows: NetworkProfile[],
  profile: NetworkProfile | null,
  limit: number,
): NetworkProfile[] {
  return [...rows]
    .map((row) => ({ row, score: scoreRow(row, profile) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.row);
}

function batchBranchLabel(profile: NetworkProfile | null): string {
  const dept = profile?.department?.trim();
  const batch = profile?.batch_year;
  if (dept && batch != null) return `${dept} ${batch}`;
  if (dept) return dept;
  if (batch != null) return `batch ${batch}`;
  return "your batch";
}

/**
 * People-you-might-know: prefer same department/batch, then fall back to
 * recent joiners / graduates across the college so the column is rarely empty.
 */
export async function loadDashboardSuggestions(opts: {
  supabase: SupabaseClient;
  profileSelect: string;
  uid: string;
  profile: NetworkProfile | null;
  conversations: ConversationRow[];
  limit?: number;
}): Promise<SuggestionBundle> {
  const { supabase, profileSelect, uid, profile, conversations } = opts;
  const limit = opts.limit ?? 4;
  const quote = (value: string) => {
    if (/^[A-Za-z0-9._-]+$/.test(value)) return value;
    return `"${value.replace(/"/g, '\\"')}"`;
  };

  const branches: string[] = [];
  if (profile?.department?.trim()) {
    branches.push(
      `and(department.eq.${quote(profile.department.trim())},id.neq.${uid})`,
    );
  }
  if (profile?.batch_year != null) {
    branches.push(`and(batch_year.eq.${profile.batch_year},id.neq.${uid})`);
  }

  let primary: NetworkProfile[] = [];

  if (branches.length > 0) {
    const { data, error } = await supabase
      .from("profiles")
      .select(profileSelect)
      .or(branches.join(","))
      .limit(12);
    if (error) {
      console.error("dashboard suggestions query failed", error);
    } else {
      primary = filterVisible(
        rankTake((data ?? []) as unknown as NetworkProfile[], profile, limit * 2),
        uid,
        conversations,
      ).slice(0, limit);
    }
  }

  if (primary.length > 0) {
    return { profiles: primary, note: null };
  }

  const exclude = new Set<string>([uid]);
  const fallback: NetworkProfile[] = [];

  const { data: grads, error: gradError } = await supabase
    .from("profiles")
    .select(profileSelect)
    .eq("status", "graduate")
    .neq("id", uid)
    .order("batch_year", { ascending: false })
    .limit(12);

  if (gradError) {
    console.error("dashboard graduate fallback failed", gradError);
  } else {
    for (const row of filterVisible(
      (grads ?? []) as unknown as NetworkProfile[],
      uid,
      conversations,
    )) {
      if (exclude.has(row.id)) continue;
      exclude.add(row.id);
      fallback.push(row);
      if (fallback.length >= limit) break;
    }
  }

  if (fallback.length < limit) {
    const recentAttempt = await supabase
      .from("profiles")
      .select(profileSelect)
      .neq("id", uid)
      .order("created_at", { ascending: false })
      .limit(16);

    let pool = (recentAttempt.data ?? []) as unknown as NetworkProfile[];
    if (recentAttempt.error || pool.length === 0) {
      const anyAttempt = await supabase
        .from("profiles")
        .select(profileSelect)
        .neq("id", uid)
        .limit(16);
      if (anyAttempt.error) {
        console.error("dashboard community fallback failed", anyAttempt.error);
      }
      pool = (anyAttempt.data ?? []) as unknown as NetworkProfile[];
    }

    for (const row of filterVisible(pool, uid, conversations)) {
      if (exclude.has(row.id)) continue;
      exclude.add(row.id);
      fallback.push(row);
      if (fallback.length >= limit) break;
    }
  }

  if (fallback.length === 0) {
    return { profiles: [], note: null };
  }

  const label = batchBranchLabel(profile);
  const note =
    branches.length === 0
      ? "Add your batch and branch on your profile for closer matches — here are others from your college"
      : `No one from ${label} yet — here are others from your college`;

  return { profiles: fallback.slice(0, limit), note };
}
