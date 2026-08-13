import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/server";
import { CompleteProfileForm } from "@/components/complete-profile-form";
import { assertNotBlockedEmail } from "@/lib/blocked-email";
import { isCollegeEmail, COLLEGE_EMAIL_ERROR } from "@/lib/college";

export default async function CompleteProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  if (!isCollegeEmail(user.email)) {
    await supabase.auth.signOut();
    redirect(`/auth?error=${encodeURIComponent(COLLEGE_EMAIL_ERROR)}`);
  }

  const blocked = await assertNotBlockedEmail(supabase, user.email);
  if (!blocked.ok) {
    await supabase.auth.signOut();
    redirect(`/auth?error=${encodeURIComponent(blocked.error)}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) {
    redirect("/dashboard");
  }

  const defaultFullName =
    (user.user_metadata?.full_name as string | undefined) ||
    (user.user_metadata?.name as string | undefined) ||
    "";

  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#d8f3ee_0%,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#e8eefc_0%,_transparent_45%)]"
      />

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12 sm:px-6">
        <div className="mb-8 text-center">
          <div className="flex justify-center">
            <BrandLogo href="/dashboard" variant="wordmark" size="hero" priority />
          </div>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-bold text-slate-900">
            Complete your profile
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            One quick step so seniors and peers can find you in the network.
          </p>
        </div>

        <div className="rounded-2xl border border-teal-900/8 bg-white/80 p-6 shadow-[0_20px_50px_-24px_rgba(15,118,110,0.35)] backdrop-blur-sm sm:p-8">
          <CompleteProfileForm
            defaultFullName={defaultFullName}
            email={user.email ?? ""}
          />
        </div>
      </main>
    </div>
  );
}
