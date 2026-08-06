import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#d8f3ee_0%,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#e8eefc_0%,_transparent_45%)]"
      />
      <main className="relative z-10 mx-auto flex w-full min-w-0 max-w-2xl flex-1 flex-col items-center justify-center overflow-x-clip px-4 py-12 text-center sm:px-5 sm:py-16">
        <h1 className="sr-only">Cohortly</h1>
        <div className="flex justify-center">
          <BrandLogo href={null} variant="wordmark" size="hero" priority />
        </div>
        <p className="mt-4 max-w-md text-base text-[var(--muted)] sm:text-lg">
          Your college network for mentorship, referrals, and advice.
        </p>
        <Link
          href="/auth"
          className="mt-8 w-full max-w-xs rounded-xl bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] sm:w-auto"
        >
          Get started
        </Link>
      </main>
    </div>
  );
}
