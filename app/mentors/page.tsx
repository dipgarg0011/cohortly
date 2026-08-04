import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { MentorsBoard } from "@/components/mentors-board";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import {
  normalizeMatchedAsk,
  normalizeMentorshipRequest,
  normalizeRequestAnswer,
  normalizeRequestMatch,
  type MatchedAsk,
  type MentorshipRequest,
  type MentorProfileSnippet,
  type RequestAnswer,
  type RequestMatch,
} from "@/lib/mentorship";

const REQUEST_COLS =
  "id, student_id, title, description, tags, category, target_company, urgency, preferred_duration, status, expires_at, created_at, is_anonymous, revealed_at, quality_score, reach_stage, last_escalated_at, nudge_count, resolution, is_public_after_expiry, awaiting_resolution_at";

const MATCH_COLS =
  "id, request_id, mentor_id, match_score, match_reasons, status, referred_to, referred_by, responded_at, created_at";

const ANSWER_COLS =
  "id, request_id, match_id, mentor_id, content, is_public, helpful, created_at";

const PROFILE_COLS =
  "id, full_name, batch_year, company, role_title, current_job, avatar_url, department, status";

export default async function MentorsPage() {
  const { supabase, user } = await requireProfile();

  const [
    { data: profile },
    { data: myRequestRows, error: requestError },
    { data: matchedAskRows, error: matchError },
    { data: availabilityRow },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("batch_year, status, skills, bio, department")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("mentorship_requests")
      .select(REQUEST_COLS)
      .eq("student_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.rpc("list_my_matched_asks"),
    supabase
      .from("mentor_availability")
      .select("mentor_id, is_available, topics, max_open_requests, bio_note")
      .eq("mentor_id", user.id)
      .maybeSingle(),
  ]);

  const loadError = requestError || matchError;

  // Best-effort lifecycle jobs — ignore failures so the page still loads.
  await Promise.all([
    supabase.rpc("escalate_open_mentorship_requests"),
    supabase.rpc("nudge_unresponsive_matches"),
    supabase.rpc("apply_mentorship_expiry_rules"),
  ]);

  if (loadError) {
    return (
      <PageShell accent="mentors">
        <Navbar />
        <main className="relative z-10 mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-4 py-6 sm:px-6 sm:py-10">
          <PageHeader
            accent="mentors"
            eyebrow="Guidance"
            title="Mentors"
            description="Post what you need — we route each ask to mentors whose skills strongly match."
          />
          <div className="surface-card border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            <p>Couldn&apos;t load mentorship data.</p>
            <p className="mt-2 text-xs text-red-600/90">{loadError.message}</p>
          </div>
        </main>
      </PageShell>
    );
  }

  const initialMatchedAsks: MatchedAsk[] = (
    (matchedAskRows ?? []) as Record<string, unknown>[]
  ).map((row) => normalizeMatchedAsk(row));

  const myRequestIds = (myRequestRows ?? []).map((r) => r.id as string);

  let answerRows: Record<string, unknown>[] = [];
  let connectedMatchRows: Record<string, unknown>[] = [];
  if (myRequestIds.length > 0) {
    const [{ data: answers }, { data: connected }] = await Promise.all([
      supabase
        .from("request_answers")
        .select(ANSWER_COLS)
        .in("request_id", myRequestIds)
        .order("created_at", { ascending: true }),
      supabase
        .from("request_matches")
        .select(MATCH_COLS)
        .in("request_id", myRequestIds)
        .in("status", ["accepted", "answered"]),
    ]);
    answerRows = (answers ?? []) as Record<string, unknown>[];
    connectedMatchRows = (connected ?? []) as Record<string, unknown>[];
  }

  const mentorIds = new Set<string>();
  for (const row of connectedMatchRows) {
    mentorIds.add(row.mentor_id as string);
  }
  for (const row of answerRows) {
    mentorIds.add(row.mentor_id as string);
  }

  const profileMap = new Map<string, MentorProfileSnippet>();
  if (mentorIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select(PROFILE_COLS)
      .in("id", Array.from(mentorIds))
      .neq("id", user.id);
    for (const p of (profiles ?? []) as MentorProfileSnippet[]) {
      if (p.id === user.id) continue;
      profileMap.set(p.id, p);
    }
  }

  const initialRequests: MentorshipRequest[] = (myRequestRows ?? []).map(
    (row) => normalizeMentorshipRequest(row as Record<string, unknown>),
  );

  const initialAnswers: RequestAnswer[] = answerRows.map((row) => {
    const answer = normalizeRequestAnswer(row);
    answer.mentor = profileMap.get(answer.mentor_id) ?? null;
    return answer;
  });

  const connectedByRequest: Record<string, RequestMatch> = {};
  for (const row of connectedMatchRows) {
    const match = normalizeRequestMatch(row);
    match.mentor = profileMap.get(match.mentor_id) ?? null;
    const existing = connectedByRequest[match.request_id];
    if (
      !existing ||
      (existing.status !== "accepted" && match.status === "accepted") ||
      (existing.status !== "answered" && match.status === "answered")
    ) {
      connectedByRequest[match.request_id] = match;
    }
  }

  const initialAvailable = Boolean(availabilityRow?.is_available);
  const profileSkills = (profile?.skills as string[] | null) ?? [];
  const profileBio = (profile?.bio as string | null)?.trim() || null;

  return (
    <PageShell accent="mentors">
      <Navbar />
      <main className="relative z-10 mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-4 py-6 sm:px-6 sm:py-10">
        <PageHeader
          accent="mentors"
          eyebrow="Guidance"
          title="Mentors"
          description="Anyone can ask for help or offer to mentor. Asks are routed by relevance — senior mentors first."
        />

        <MentorsBoard
          currentUserId={user.id}
          initialAvailable={initialAvailable}
          profileSkills={profileSkills}
          profileBio={profileBio}
          initialRequests={initialRequests}
          initialMatchedAsks={initialMatchedAsks}
          initialAnswers={initialAnswers}
          connectedByRequestId={connectedByRequest}
          studentDepartment={
            (profile?.department as string | null | undefined) ?? null
          }
        />
      </main>
    </PageShell>
  );
}
