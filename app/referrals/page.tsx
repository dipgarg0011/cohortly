import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { ReferralBoard } from "@/components/referral-board";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import {
  REFERRAL_SELECT,
  normalizeReachStats,
  normalizeReferralRequest,
  type ReferralReachStats,
  type ReferralRequest,
} from "@/lib/referrals";
import { isGraduateStatus, type ProfileStatus } from "@/lib/network";

export default async function ReferralsPage() {
  const { supabase, user } = await requireProfile();

  const [
    { data, error },
    { data: me },
    { data: companyRows },
    { data: dismissalRows },
  ] = await Promise.all([
    supabase
      .from("referral_requests")
      .select(REFERRAL_SELECT)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("status, company")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.rpc("list_known_companies"),
    supabase
      .from("referral_dismissals")
      .select("request_id")
      .eq("user_id", user.id),
  ]);

  const mineIds = (data ?? [])
    .filter((row) => (row as { student_id: string }).student_id === user.id)
    .map((row) => (row as { id: string }).id);

  const [{ data: questionRows }, { data: viewRows }] =
    mineIds.length > 0
      ? await Promise.all([
          supabase
            .from("referral_questions")
            .select("request_id")
            .in("request_id", mineIds),
          supabase
            .from("referral_views")
            .select("request_id")
            .in("request_id", mineIds),
        ])
      : [{ data: [] }, { data: [] }];

  const questionCounts = new Map<string, number>();
  for (const row of questionRows ?? []) {
    const id = row.request_id as string;
    questionCounts.set(id, (questionCounts.get(id) ?? 0) + 1);
  }

  const viewCounts = new Map<string, number>();
  for (const row of viewRows ?? []) {
    const id = row.request_id as string;
    viewCounts.set(id, (viewCounts.get(id) ?? 0) + 1);
  }

  const requests: ReferralRequest[] = (data ?? []).map((row) => {
    const normalized = normalizeReferralRequest(
      row as Record<string, unknown>,
    );
    return {
      ...normalized,
      question_count: questionCounts.get(normalized.id) ?? 0,
      view_count: viewCounts.get(normalized.id) ?? 0,
    };
  });

  const myOpenIds = requests
    .filter((r) => r.student_id === user.id && r.status === "open")
    .map((r) => r.id);

  const reachEntries = await Promise.all(
    myOpenIds.map(async (id) => {
      const { data: stats } = await supabase.rpc("referral_reach_stats", {
        p_request_id: id,
      });
      const row = Array.isArray(stats) ? stats[0] : stats;
      return [id, normalizeReachStats(row as Record<string, unknown>)] as const;
    }),
  );

  const reachById: Record<string, ReferralReachStats> = {};
  for (const [id, stats] of reachEntries) {
    if (stats) reachById[id] = stats;
  }

  const knownCompanies = ((companyRows ?? []) as Array<string | { company?: string }>)
    .map((r) => {
      if (typeof r === "string") return r;
      return r.company ?? "";
    })
    .filter(Boolean);

  const isGraduate = isGraduateStatus(
    (me?.status as ProfileStatus | null | undefined) ?? null,
  );

  return (
    <PageShell accent="referrals">
      <Navbar />
      <main className="relative z-10 mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-4 py-6 sm:px-6 sm:py-10">
        <PageHeader
          accent="referrals"
          eyebrow="Career help"
          title="Referrals"
          description="Need one? Ask clearly. Can help? Start with a question or accept and refer."
        />

        {error ? (
          <div className="surface-card border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            Couldn&apos;t load referral requests. If you just added columns, run
            the tiered referral SQL migration in Supabase.
          </div>
        ) : (
          <ReferralBoard
            currentUserId={user.id}
            isGraduate={isGraduate}
            viewerCompany={me?.company ?? null}
            initialRequests={requests}
            knownCompanies={knownCompanies}
            reachById={reachById}
            dismissedIds={(dismissalRows ?? []).map(
              (r) => r.request_id as string,
            )}
          />
        )}
      </main>
    </PageShell>
  );
}
