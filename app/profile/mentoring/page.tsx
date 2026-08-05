import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { MentorSettings } from "@/components/mentor-settings";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import { isGraduateStatus, type ProfileStatus } from "@/lib/network";
import type { MentorOnboardingState } from "@/lib/mentorship";

/**
 * Dedicated mentor-settings URL. Students are blocked with a clear message;
 * graduates get the same settings as on /profile#mentoring.
 */
export default async function MentoringSettingsPage() {
  const { supabase, user } = await requireProfile();

  const [{ data: profile }, { data: availability }] = await Promise.all([
    supabase
      .from("profiles")
      .select("status, skills")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("mentor_availability")
      .select(
        "is_available, is_paused, onboarding_state, max_open_requests, topics, bio_note",
      )
      .eq("mentor_id", user.id)
      .maybeSingle(),
  ]);

  const isGraduate = isGraduateStatus(
    (profile?.status as ProfileStatus | null | undefined) ?? null,
  );

  const mentorInitial = availability
    ? {
        is_available: Boolean(availability.is_available),
        is_paused: Boolean(availability.is_paused),
        onboarding_state: (availability.onboarding_state ??
          "not_asked") as MentorOnboardingState,
        max_open_requests: Number(availability.max_open_requests ?? 5),
        topics: (availability.topics as string[] | null) ?? [],
        bio_note: (availability.bio_note as string | null) ?? null,
      }
    : null;

  return (
    <PageShell accent="profile">
      <Navbar />
      <main className="relative z-10 mx-auto w-full min-w-0 max-w-3xl flex-1 overflow-x-clip px-3 py-6 sm:px-6 sm:py-10">
        <PageHeader
          accent="profile"
          eyebrow="Mentoring"
          title="Mentor settings"
          description={
            isGraduate
              ? "Control availability, pause, capacity, and topics."
              : "Mentoring is for graduates."
          }
        />
        <div className="animate-fade-up">
          <MentorSettings
            isGraduate={isGraduate}
            initialAvailability={mentorInitial}
            profileSkills={(profile?.skills as string[] | null) ?? []}
          />
        </div>
      </main>
    </PageShell>
  );
}
