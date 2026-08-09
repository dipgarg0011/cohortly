"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DepartmentSelect } from "@/components/department-select";
import { ProfileStatusField } from "@/components/profile-status-field";
import {
  isValidDepartmentValue,
  normalizeDepartmentValue,
} from "@/lib/departments";
import {
  suggestedProfileStatus,
  type ProfileStatus,
} from "@/lib/network";

type Props = {
  defaultFullName: string;
  email: string;
};

export function CompleteProfileForm({ defaultFullName, email }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(defaultFullName);
  const [batchYear, setBatchYear] = useState("");
  const [status, setStatus] = useState<ProfileStatus>(
    suggestedProfileStatus(null),
  );
  const [statusTouched, setStatusTouched] = useState(false);
  const [department, setDepartment] = useState("");
  const [company, setCompany] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [isFounder, setIsFounder] = useState(false);

  function onBatchYearChange(value: string) {
    setBatchYear(value);
    if (statusTouched) return;
    const year = Number(value);
    if (Number.isInteger(year) && year >= 1950 && year <= 2100) {
      setStatus(suggestedProfileStatus(year));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const year = Number(batchYear);
    if (!Number.isInteger(year) || year < 1950 || year > 2100) {
      setError("Enter a valid batch year.");
      setLoading(false);
      return;
    }

    if (!fullName.trim()) {
      setError("Name and department are required.");
      setLoading(false);
      return;
    }

    const deptCode = normalizeDepartmentValue(department);
    if (!isValidDepartmentValue(deptCode)) {
      setError(
        "Select your department from the list, or enter it if it isn't listed.",
      );
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Your session expired. Please sign in again.");
      setLoading(false);
      return;
    }

    const avatarUrl =
      (user.user_metadata?.avatar_url as string | undefined) ||
      (user.user_metadata?.picture as string | undefined) ||
      null;

    const { error: insertError } = await supabase.from("profiles").insert({
      id: user.id,
      full_name: fullName.trim(),
      batch_year: year,
      status,
      department: deptCode,
      company: company.trim() || null,
      role_title: roleTitle.trim() || null,
      current_job: roleTitle.trim() || null,
      is_founder: isFounder,
      open_to: [],
      skills: [],
      avatar_url: avatarUrl,
    });

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="rounded-xl bg-teal-50 px-3.5 py-2.5 text-sm text-teal-900">
        Signed in as <span className="font-semibold">{email}</span>
      </p>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-slate-700">
          Full name
        </span>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Batch year
          </span>
          <input
            type="number"
            value={batchYear}
            onChange={(e) => onBatchYearChange(e.target.value)}
            placeholder="2024"
            required
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Department
          </span>
          <DepartmentSelect
            id="department"
            name="department"
            value={department}
            onChange={setDepartment}
            fetchFromDb
            required
          />
        </label>
      </div>

      <ProfileStatusField
        value={status}
        onChange={(next) => {
          setStatusTouched(true);
          setStatus(next);
        }}
        idPrefix="complete-status"
      />

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Company <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Role title{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
            placeholder="Student, Engineer…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
          />
        </label>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-teal-50/50 px-3.5 py-3">
        <input
          type="checkbox"
          checked={isFounder}
          onChange={(e) => setIsFounder(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
        />
        <span className="text-sm font-medium text-slate-800">
          I&apos;m a founder / building a startup
        </span>
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Saving…" : "Continue to Cohortly"}
      </button>
    </form>
  );
}
