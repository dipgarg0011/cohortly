import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COLLEGE_EMAIL_ERROR, isCollegeEmail } from "@/lib/college";

/** Require a logged-in user with a college email and an existing profiles row. */
export async function requireProfile() {
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/complete-profile");
  }

  return { supabase, user };
}
