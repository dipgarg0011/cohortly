import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { OpportunitiesBoard } from "@/components/opportunities-board";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import { normalizeOpportunity } from "@/lib/opportunities";

export default async function OpportunitiesPage() {
  const { supabase } = await requireProfile();

  const { data, error } = await supabase
    .from("opportunities")
    .select(
      `
      id, posted_by, type, title, company, description, apply_link, location, deadline, created_at,
      poster:profiles!posted_by ( id, full_name, batch_year )
    `,
    )
    .order("created_at", { ascending: false });

  const opportunities = (data ?? []).map((row) =>
    normalizeOpportunity(row as Record<string, unknown>),
  );

  return (
    <PageShell accent="opportunities">
      <Navbar />
      <main className="relative z-10 mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-3 py-6 sm:px-6 sm:py-10">
        <PageHeader
          accent="opportunities"
          eyebrow="Openings"
          title="Opportunities"
          description="Internships, jobs, research, freelance gigs, and early-stage startup roles from your community."
        />

        {error ? (
          <div className="surface-card border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            Couldn&apos;t load opportunities. Run the opportunities SQL
            migration in Supabase if you haven&apos;t yet.
          </div>
        ) : (
          <OpportunitiesBoard initialOpportunities={opportunities} />
        )}
      </main>
    </PageShell>
  );
}
