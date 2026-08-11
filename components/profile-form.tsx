"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DepartmentSelect } from "@/components/department-select";
import { ProfileStatusField } from "@/components/profile-status-field";
import { PersonAvatar } from "@/components/ui/person-avatar";
import {
  assertAffiliationFromEmail,
  expectedPassoutWindow,
  joinYearPassoutHint,
  mustBeStudentFromJoinYear,
  parseJoinYearFromEmail,
} from "@/lib/batch-from-email";
import {
  isValidDepartmentValue,
  normalizeDepartmentValue,
} from "@/lib/departments";
import {
  OPEN_TO_OPTIONS,
  SKILL_OPTIONS,
  suggestedProfileStatus,
  type EditableProfile,
  type ProfileStatus,
} from "@/lib/network";
import { uploadAvatarFile } from "@/lib/upload-avatar";

type Props = {
  initialProfile: EditableProfile;
  userId: string;
  email: string;
};

export function ProfileForm({ initialProfile, userId, email }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const joinYear = useMemo(() => parseJoinYearFromEmail(email), [email]);
  const passoutWindow = joinYear != null ? expectedPassoutWindow(joinYear) : null;
  const graduateBlocked =
    joinYear != null && mustBeStudentFromJoinYear(joinYear);

  const [fullName, setFullName] = useState(initialProfile.full_name);
  const [avatarUrl, setAvatarUrl] = useState(initialProfile.avatar_url);
  const [batchYear, setBatchYear] = useState(
    initialProfile.batch_year != null ? String(initialProfile.batch_year) : "",
  );
  const [status, setStatus] = useState<ProfileStatus>(
    graduateBlocked ? "student" : initialProfile.status,
  );
  const [statusTouched, setStatusTouched] = useState(false);
  const [department, setDepartment] = useState(initialProfile.department);
  const [company, setCompany] = useState(initialProfile.company);
  const [pastCompaniesText, setPastCompaniesText] = useState(
    initialProfile.past_companies.join(", "),
  );
  const [roleTitle, setRoleTitle] = useState(initialProfile.role_title);
  const [isFounder, setIsFounder] = useState(initialProfile.is_founder);
  const [openTo, setOpenTo] = useState<string[]>(initialProfile.open_to);
  const [skills, setSkills] = useState<string[]>(initialProfile.skills);
  const [linkedinUrl, setLinkedinUrl] = useState(initialProfile.linkedin_url);
  const [bio, setBio] = useState(initialProfile.bio);

  useEffect(() => {
    if (graduateBlocked) {
      setStatus("student");
      setOpenTo((prev) => prev.filter((tag) => tag !== "Mentoring"));
    }
  }, [graduateBlocked]);

  const isGraduate = status === "graduate";
  const openToOptions = isGraduate
    ? OPEN_TO_OPTIONS
    : OPEN_TO_OPTIONS.filter((tag) => tag !== "Mentoring");

  function onBatchYearChange(value: string) {
    setBatchYear(value);
    if (statusTouched || graduateBlocked) return;
    const year = Number(value);
    if (Number.isInteger(year) && year >= 1950 && year <= 2100) {
      setStatus(suggestedProfileStatus(year));
    }
  }

  function onStatusChange(next: ProfileStatus) {
    if (graduateBlocked && next === "graduate") return;
    setStatusTouched(true);
    setStatus(next);
    if (next === "student") {
      setOpenTo((prev) => prev.filter((tag) => tag !== "Mentoring"));
    }
  }

  function toggleTag(
    list: string[],
    setList: (next: string[]) => void,
    tag: string,
  ) {
    setList(
      list.includes(tag) ? list.filter((item) => item !== tag) : [...list, tag],
    );
  }

  async function handleAvatarChange(file: File | null) {
    if (!file) return;
    setAvatarBusy(true);
    setError(null);
    setSuccess(null);

    const supabase = createClient();
    const uploaded = await uploadAvatarFile({
      supabase,
      userId,
      file,
    });
    if ("error" in uploaded) {
      setError(uploaded.error);
      setAvatarBusy(false);
      return;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: uploaded.url })
      .eq("id", userId);

    if (updateError) {
      setError(updateError.message);
      setAvatarBusy(false);
      return;
    }

    setAvatarUrl(uploaded.url);
    setSuccess("Photo updated.");
    setAvatarBusy(false);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const year = Number(batchYear);
    if (!Number.isInteger(year) || year < 1950 || year > 2100) {
      setError("Enter a valid batch year.");
      setLoading(false);
      return;
    }

    const resolvedStatus = graduateBlocked ? "student" : status;
    const affiliation = assertAffiliationFromEmail(
      email,
      resolvedStatus,
      year,
    );
    if (!affiliation.ok) {
      setError(affiliation.error);
      setLoading(false);
      return;
    }

    const deptCode = normalizeDepartmentValue(department);
    if (!isValidDepartmentValue(deptCode, { allowEmpty: true })) {
      setError(
        "Select your department from the list, or enter it if it isn't listed.",
      );
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setError("You need to be logged in to update your profile.");
      setLoading(false);
      return;
    }

    const past_companies = pastCompaniesText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = {
      full_name: fullName.trim(),
      batch_year: year,
      status: resolvedStatus,
      department: deptCode || null,
      company: company.trim() || null,
      past_companies,
      role_title: roleTitle.trim() || null,
      current_job: roleTitle.trim() || null,
      is_founder: isFounder,
      open_to:
        resolvedStatus === "graduate"
          ? openTo
          : openTo.filter((tag) => tag !== "Mentoring"),
      skills,
      linkedin_url: linkedinUrl.trim() || null,
      bio: bio.trim() || null,
    };

    const { error: updateError } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", user.id);

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setSuccess("Profile saved.");
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="surface-card p-5 sm:p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-teal-800/80">
          Photo
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <PersonAvatar
            id={userId}
            name={fullName}
            url={avatarUrl}
            size="xl"
          />
          <div className="min-w-0 space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                void handleAvatarChange(file);
              }}
            />
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => fileRef.current?.click()}
              className="btn-secondary disabled:opacity-60"
            >
              {avatarBusy
                ? "Uploading…"
                : avatarUrl
                  ? "Replace photo"
                  : "Upload photo"}
            </button>
            <p className="text-xs text-slate-500">
              JPEG, PNG, or WebP · under 2 MB
            </p>
          </div>
        </div>
      </section>

      <section className="surface-card p-5 sm:p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-teal-800/80">
          Basics
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            id="fullName"
            value={fullName}
            onChange={setFullName}
            required
            className="sm:col-span-2"
          />
          <div className="space-y-1.5">
            <Field
              label="Batch year (passout year)"
              id="batchYear"
              type="number"
              value={batchYear}
              onChange={onBatchYearChange}
              required
            />
            <p className="text-xs text-slate-500">
              Your graduation / passout year.
            </p>
            {joinYear != null ? (
              <p className="text-xs text-teal-800/80">
                {joinYearPassoutHint(joinYear)}
              </p>
            ) : null}
          </div>
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
              allowEmpty
            />
          </label>
          <div className="sm:col-span-2">
            <ProfileStatusField
              value={status}
              onChange={onStatusChange}
              idPrefix="profile-status"
              graduateDisabled={graduateBlocked}
              graduateDisabledReason={
                joinYear != null
                  ? `Your email suggests joining ${joinYear}; graduation is typically ${passoutWindow?.min}–${passoutWindow?.typicalMax}. You can't register as a graduate yet.`
                  : undefined
              }
            />
          </div>
          <Field
            label="LinkedIn URL"
            id="linkedinUrl"
            type="url"
            value={linkedinUrl}
            onChange={setLinkedinUrl}
            placeholder="https://linkedin.com/in/…"
            className="sm:col-span-2"
          />
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Bio
            </span>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
              placeholder="A short intro for your college community…"
            />
          </label>
        </div>
      </section>

      <section className="surface-card p-5 sm:p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-teal-800/80">
          Work & startup
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Company"
            id="company"
            value={company}
            onChange={setCompany}
            placeholder="Company or startup name"
          />
          <Field
            label="Role title"
            id="roleTitle"
            value={roleTitle}
            onChange={setRoleTitle}
            placeholder="Software Engineer, Founder…"
          />
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Past companies{" "}
              <span className="font-normal text-slate-400">
                (comma-separated, for referral matching)
              </span>
            </span>
            <input
              id="pastCompanies"
              value={pastCompaniesText}
              onChange={(e) => setPastCompaniesText(e.target.value)}
              placeholder="Google, Microsoft,…"
              className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-teal-50/50 px-3.5 py-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={isFounder}
              onChange={(e) => setIsFounder(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">
                I&apos;m a founder / building a startup
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Shows a Founder badge on your network card.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="surface-card p-5 sm:p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-teal-800/80">
          Open to
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          What kinds of help or connections are you open to?
          {!isGraduate && (
            <span className="block text-xs text-slate-500">
              Mentoring is available once you mark yourself as a graduate.
            </span>
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {openToOptions.map((tag) => {
            const active = openTo.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(openTo, setOpenTo, tag)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--brand)] text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-teal-50 hover:text-teal-900"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </section>

      <section className="surface-card p-5 sm:p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-teal-800/80">
          Skills & interests
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Pick tags so others can find you more easily.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {SKILL_OPTIONS.map((tag) => {
            const active = skills.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(skills, setSkills, tag)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-teal-100 text-teal-900 ring-1 ring-teal-300"
                    : "bg-slate-100 text-slate-700 hover:bg-teal-50 hover:text-teal-900"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800"
        >
          {success}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary disabled:opacity-60"
      >
        {loading ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  className = "",
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
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
        required={required}
        className="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
      />
    </label>
  );
}
