import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { ReferralBoard } from "@/components/referral-board";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import { normalizeReferralRequest } from "@/lib/referrals";

export default async function ReferralsPage() {
  const { supabase, user } = await requireProfile();

  const { data, error } = await supabase
    .from("referral_requests")
    .select(
      `
      id, student_id, company, role, resume_url, job_link, deadline, status, accepted_by, created_at,
      student:profiles!student_id ( id, full_name, batch_year, avatar_url ),
      acceptor:profiles!accepted_by ( id, full_name, batch_year, avatar_url )
    `,
    )
    .order("created_at", { ascending: false });

  const requests = (data ?? []).map((row) =>
    normalizeReferralRequest(row as Record<string, unknown>),
  );

  return (
    <PageShell accent="referrals">
      <Navbar />
      <main className="relative z-10 mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-4 py-6 sm:px-6 sm:py-10">
        <PageHeader
          accent="referrals"
          eyebrow="Career help"
          title="Referrals"
          description="Need one? Ask clearly. Can help? Pick an open ask and refer someone from your college."
        />

        {error ? (
          <div className="surface-card border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            Couldn&apos;t load referral requests. Run the referral SQL migration
            in Supabase if you haven&apos;t yet.
          </div>
        ) : (
          <ReferralBoard
            currentUserId={user.id}
            initialRequests={requests}
          />
        )}
      </main>
    </PageShell>
  );
}
