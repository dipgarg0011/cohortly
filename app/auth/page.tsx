"use client";

import { Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  COLLEGE_EMAIL_DOMAIN,
  COLLEGE_EMAIL_ERROR,
  isCollegeEmail,
} from "@/lib/college";

type Mode = "login" | "signup";

export default function AuthPage() {
  return (
    <Suspense fallback={<AuthShell />}>
      <AuthForm />
    </Suspense>
  );
}

function AuthShell({ children }: { children?: ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-1 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#d8f3ee_0%,_transparent_55%),radial-gradient(ellipse_at_bottom_right,_#e8eefc_0%,_transparent_45%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f766e' fill-opacity='0.06'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
      />
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12 sm:px-6">
        {children ?? (
          <div className="rounded-2xl border border-teal-900/8 bg-white/80 p-8 text-center text-sm text-slate-500">
            Loading…
          </div>
        )}
      </main>
    </div>
  );
}

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [batchYear, setBatchYear] = useState("");
  const [department, setDepartment] = useState("");

  useEffect(() => {
    const fromUrl = searchParams.get("error");
    if (fromUrl) {
      setError(fromUrl);
    }
  }, [searchParams]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setMessage(null);
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback`;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          // Hint Google Workspace accounts for this college domain
          hd: COLLEGE_EMAIL_DOMAIN,
          prompt: "select_account",
        },
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const trimmedEmail = email.trim().toLowerCase();

    try {
      if (!isCollegeEmail(trimmedEmail)) {
        setError(COLLEGE_EMAIL_ERROR);
        return;
      }

      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (signInError) {
          setError(signInError.message);
          return;
        }

        router.push("/dashboard");
        router.refresh();
        return;
      }

      const year = Number(batchYear);
      if (!Number.isInteger(year) || year < 1950 || year > 2100) {
        setError("Enter a valid batch year.");
        return;
      }

      const { data: signUpData, error: signUpError } =
        await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              batch_year: year,
              department: department.trim(),
            },
          },
        });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      const userId = signUpData.user?.id;
      if (!userId) {
        setError("Signup succeeded but no user was returned. Try logging in.");
        return;
      }

      const { error: profileError } = await supabase.from("profiles").insert({
        id: userId,
        full_name: fullName.trim(),
        batch_year: year,
        department: department.trim(),
      });

      if (profileError) {
        setError(
          `Account created, but profile setup failed: ${profileError.message}`,
        );
        return;
      }

      if (!signUpData.session) {
        setMessage(
          "Account created. Check your email to confirm, then log in.",
        );
        setMode("login");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <div className="mb-8 text-center">
        <p className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-[var(--brand)] sm:text-5xl">
          Cohortly
        </p>
        <p className="mt-3 text-base text-[var(--muted)]">
          Connect with your college batch — mentors, seniors, and friends.
        </p>
      </div>

      <div className="rounded-2xl border border-teal-900/8 bg-white/80 p-6 shadow-[0_20px_50px_-24px_rgba(15,118,110,0.35)] backdrop-blur-sm sm:p-8">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleIcon />
          {googleLoading ? "Redirecting…" : "Continue with Google"}
        </button>
        <p className="mt-2 text-center text-xs text-slate-500">
          Use your <span className="font-medium">@{COLLEGE_EMAIL_DOMAIN}</span>{" "}
          college email
        </p>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            or
          </span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-teal-50 p-1">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              mode === "login"
                ? "bg-white text-teal-900 shadow-sm"
                : "text-teal-700/70 hover:text-teal-900"
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              mode === "signup"
                ? "bg-white text-teal-900 shadow-sm"
                : "text-teal-700/70 hover:text-teal-900"
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <>
              <Field
                label="Full name"
                id="fullName"
                value={fullName}
                onChange={setFullName}
                autoComplete="name"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Batch year"
                  id="batchYear"
                  type="number"
                  value={batchYear}
                  onChange={setBatchYear}
                  placeholder="2024"
                  required
                />
                <Field
                  label="Department"
                  id="department"
                  value={department}
                  onChange={setDepartment}
                  placeholder="CSE"
                  required
                />
              </div>
            </>
          )}

          <Field
            label="College email"
            id="email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            placeholder={`you@${COLLEGE_EMAIL_DOMAIN}`}
            pattern={`[^@\\s]+@${COLLEGE_EMAIL_DOMAIN.replace(/\./g, "\\.")}`}
            title={`Must be an @${COLLEGE_EMAIL_DOMAIN} address`}
            required
          />
          <p className="-mt-2 text-xs text-slate-500">
            Only @{COLLEGE_EMAIL_DOMAIN} addresses can sign up or log in.
          </p>
          <Field
            label="Password"
            id="password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            minLength={6}
            required
          />

          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          {message && (
            <p
              role="status"
              className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800"
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="flex w-full items-center justify-center rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading
              ? mode === "login"
                ? "Logging in…"
                : "Creating account…"
              : mode === "login"
                ? "Log in"
                : "Create account"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.5 2.7 12 2.7 6.9 2.7 2.7 6.9 2.7 12S6.9 21.3 12 21.3c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"
      />
      <path
        fill="#34A853"
        d="M3.9 7.4l3 2.2C7.7 7.5 9.7 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.5 2.7 12 2.7 8.4 2.7 5.3 4.7 3.9 7.4z"
        opacity="0"
      />
      <path
        fill="#4285F4"
        d="M12 21.3c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-3.6 0-4.9-2.4-5.1-3.6H3.8v2.3C5.2 19.3 8.3 21.3 12 21.3z"
      />
      <path
        fill="#FBBC05"
        d="M6.9 14.2c-.2-.6-.4-1.2-.4-1.9s.1-1.3.4-1.9V8.1H3.8C3.1 9.3 2.7 10.6 2.7 12s.4 2.7 1.1 3.9l3.1-1.7z"
      />
      <path
        fill="#EA4335"
        d="M12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.5 2.7 12 2.7 8.4 2.7 5.3 4.7 3.9 7.4l3 2.2C7.7 7.5 9.7 6.2 12 6.2z"
      />
    </svg>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
  placeholder,
  autoComplete,
  minLength,
  pattern,
  title,
  required,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  pattern?: string;
  title?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        pattern={pattern}
        title={title}
        required={required}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
      />
    </label>
  );
}
