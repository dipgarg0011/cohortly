import { requireProfile } from "@/lib/require-profile";
import { Navbar } from "@/components/navbar";
import { ProfileForm } from "@/components/profile-form";
import { PageShell, PageHeader } from "@/components/ui/page-shell";
import {
  suggestedProfileStatus,
  type EditableProfile,
  type ProfileStatus,
} from "@/lib/network";

export default async function ProfilePage() {
  const { supabase, user } = await requireProfile();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "full_name, batch_year, status, department, company, past_companies, role_title, is_founder, open_to, skills, linkedin_url, bio",
    )
    .eq("id", user.id)
    .maybeSingle();

  const status =
    (profile?.status as ProfileStatus | null | undefined) ??
    suggestedProfileStatus(profile?.batch_year ?? null);

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
  };

  return (
    <PageShell accent="profile">
      <Navbar />
      <main className="relative z-10 mx-auto w-full min-w-0 max-w-3xl flex-1 overflow-x-clip px-3 py-6 sm:px-6 sm:py-10">
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
          <div className="animate-fade-up">
            <ProfileForm initialProfile={initialProfile} />
          </div>
        )}
      </main>
    </PageShell>
  );
}
