import Link from "next/link";
import { redirect } from "next/navigation";
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
      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-5 py-16 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-5xl font-bold tracking-tight text-[var(--brand)] sm:text-6xl">
          Cohortly
        </h1>
        <p className="mt-4 max-w-md text-lg text-[var(--muted)]">
          Your college network for mentorship, referrals, and advice.
        </p>
        <Link
          href="/auth"
          className="mt-8 rounded-xl bg-[var(--brand)] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)]"
        >
          Get started
        </Link>
      </main>
    </div>
  );
}
