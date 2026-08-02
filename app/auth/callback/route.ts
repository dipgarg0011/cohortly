import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  COLLEGE_EMAIL_ERROR,
  isCollegeEmail,
} from "@/lib/college";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");
  const oauthErrorDescription = searchParams.get("error_description");

  if (oauthError) {
    const message = oauthErrorDescription || oauthError;
    return NextResponse.redirect(
      `${origin}/auth?error=${encodeURIComponent(message)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/auth?error=${encodeURIComponent("Missing OAuth code. Please try again.")}`,
    );
  }

  const supabase = await createClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      `${origin}/auth?error=${encodeURIComponent(exchangeError.message)}`,
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${origin}/auth?error=${encodeURIComponent(COLLEGE_EMAIL_ERROR)}`,
    );
  }

  if (!isCollegeEmail(user.email)) {
    // Do not create a profile — sign out immediately.
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${origin}/auth?error=${encodeURIComponent(COLLEGE_EMAIL_ERROR)}`,
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.redirect(`${origin}/complete-profile`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
