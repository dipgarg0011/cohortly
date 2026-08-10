import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { ProfileForm } from "@/components/profile-form";
import { MentorSettings } from "@/components/mentor-settings";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import { isGraduateStatus } from "@/lib/network";
import {
  suggestedProfileStatus,
  type EditableProfile,
  type ProfileStatus,
} from "@/lib/network";
import type { MentorOnboardingState } from "@/lib/mentorship";

export default async function ProfilePage() {
  const { supabase, user } = await requireProfile();

  const [{ data: profile, error }, { data: availability }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "full_name, batch_year, status, department, company, past_companies, role_title, is_founder, open_to, skills, linkedin_url, bio, avatar_url",
      )
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

  const status =
    (profile?.status as ProfileStatus | null | undefined) ??
    suggestedProfileStatus(profile?.batch_year ?? null);
  const isGraduate = isGraduateStatus(status);

  const initialProfile: EditableProfile = {
    full_name: profile?.full_name ?? "",
    batch_year: profile?.batch_year ?? null,
    status,
    department: profile?.department ?? "",
    company: profile?.company ?? "",
    past_companies: profile?.past_companies ?? [],
    role_title: profile?.role_title ?? "",
    is_founder: profile?.is_founder ?? false,
    open_to: profile?.open_to ?? [],
    skills: profile?.skills ?? [],
    linkedin_url: profile?.linkedin_url ?? "",
    bio: profile?.bio ?? "",
    avatar_url: profile?.avatar_url ?? null,
  };

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
      <main className="relative z-10 mx-auto w-full min-w-0 max-w-3xl flex-1 overflow-x-clip px-4 py-6 sm:px-6 sm:py-10">
        <PageHeader
          accent="profile"
          eyebrow="You"
          title="Your profile"
          description="Help seniors and peers find you — share what you do and what you're open to."
        />

        {error ? (
          <div className="surface-card border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            Couldn&apos;t load your profile. If you just added new columns, make
            sure the SQL migration has been run in Supabase.
          </div>
        ) : (
          <div className="animate-fade-up space-y-6">
            <ProfileForm initialProfile={initialProfile} userId={user.id} />
            {isGraduate ? (
              <div id="mentoring">
                <MentorSettings
                  isGraduate
                  initialAvailability={mentorInitial}
                  profileSkills={initialProfile.skills}
                />
              </div>
            ) : null}
          </div>
        )}
      </main>
    </PageShell>
  );
}
