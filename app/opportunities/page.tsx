import { Suspense } from "react";
import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { OpportunitiesBoard } from "@/components/opportunities-board";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import {
  normalizeApplication,
  normalizeOpportunity,
  OPPORTUNITY_SELECT,
  sortOpportunities,
} from "@/lib/opportunities";

export default async function OpportunitiesPage() {
  const { supabase, user } = await requireProfile();

  const [opportunitiesRes, applicationsRes] = await Promise.all([
    supabase
      .from("opportunities")
      .select(OPPORTUNITY_SELECT)
      .order("deadline", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("opportunity_applications")
      .select(
        `
      id, opportunity_id, applicant_id, pitch, resume_url, status, outcome, stage_updated_at, created_at,
      opportunity:opportunities (
        id, posted_by, type, title, company, description, apply_link, contact_info, location, deadline, created_at,
        poster:profiles!posted_by ( id, full_name, batch_year, status )
      ),
      applicant:profiles!applicant_id (
        id, full_name, batch_year, department, skills, avatar_url
      )
    `,
      )
      .order("created_at", { ascending: false }),
  ]);

  const opportunities = sortOpportunities(
    (opportunitiesRes.data ?? []).map((row) =>
      normalizeOpportunity(row as Record<string, unknown>),
    ),
  );

  const applications = (applicationsRes.data ?? []).map((row) =>
    normalizeApplication(row as Record<string, unknown>),
  );

  const myApplications = applications.filter(
    (app) => app.applicant_id === user.id,
  );
  const receivedApplications = applications.filter(
    (app) => app.opportunity?.posted_by === user.id,
  );

  const loadError = opportunitiesRes.error || applicationsRes.error;

  return (
    <PageShell accent="opportunities">
      <Navbar />
      <main className="relative z-10 mx-auto w-full min-w-0 max-w-6xl flex-1 overflow-x-clip px-4 py-6 sm:px-6 sm:py-10">
        <PageHeader
          accent="opportunities"
          eyebrow="Openings"
          title="Opportunities"
          description="Internships, jobs, research, freelance gigs, and early-stage startup roles from your community."
        />

        {loadError ? (
          <div className="surface-card border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            Couldn&apos;t load opportunities
            {applicationsRes.error
              ? " (applications may need the opportunity_applications migration)."
              : ". Run the opportunities SQL migration in Supabase if you haven&apos;t yet."}
          </div>
        ) : (
          <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
            <OpportunitiesBoard
              currentUserId={user.id}
              initialOpportunities={opportunities}
              initialMyApplications={myApplications}
              initialReceivedApplications={receivedApplications}
            />
          </Suspense>
        )}
      </main>
    </PageShell>
  );
}
