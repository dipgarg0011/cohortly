"use client";

import {
  formatCohortLockup,
  getProfileRole,
  type NetworkProfile,
} from "@/lib/network";
import { SurfaceCard } from "@/components/ui/surface-card";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { ProfilePreviewTrigger } from "@/components/profile-preview";

type Props = {
  profile: NetworkProfile;
  currentYear?: number;
  isSelf?: boolean;
  onSayHi?: () => void;
  sayHiLabel?: string;
  sayHiDisabled?: boolean;
  /** Compact row layout for dashboard mobile suggestions */
  dense?: boolean;
  accent?: "network" | "mentors" | "referrals" | "opportunities";
};

export function ProfileCard({
  profile,
  currentYear = new Date().getFullYear(),
  isSelf = false,
  onSayHi,
  sayHiLabel = "Connect",
  sayHiDisabled = false,
  dense = false,
  accent = "network",
}: Props) {
  void currentYear;
  void accent;
  const role = getProfileRole(profile.status);
  const name = profile.full_name?.trim() || "Unnamed member";
  const roleTitle =
    profile.role_title?.trim() || profile.current_job?.trim() || "";
  const company = profile.company?.trim() || "";
  const openTo = profile.open_to ?? [];
  const cohort = formatCohortLockup(profile.batch_year, profile.department);
  const meta = [
    cohort,
    role,
    profile.is_founder ? "Founder" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (dense) {
    return (
      <SurfaceCard
        as="article"
        interactive
        className="w-full max-w-full min-w-0 overflow-hidden !rounded-xl px-3 py-2.5"
      >
        <div className="flex w-full min-w-0 items-center gap-3">
          <ProfilePreviewTrigger userId={profile.id} className="shrink-0">
            <PersonAvatar
              id={profile.id}
              name={profile.full_name}
              url={profile.avatar_url}
              size="md"
            />
          </ProfilePreviewTrigger>
          <div className="min-w-0 flex-1 overflow-hidden">
            <ProfilePreviewTrigger userId={profile.id}>
              <h2
                title={name}
                className="min-w-0 truncate text-base font-bold leading-snug text-slate-900"
              >
                {name}
              </h2>
            </ProfilePreviewTrigger>
            {meta ? (
              <p
                title={meta}
                className="mt-0.5 min-w-0 truncate text-xs font-medium text-slate-500"
              >
                {meta}
              </p>
            ) : null}
          </div>
          {!isSelf && onSayHi ? (
            sayHiDisabled ? (
              <span className="inline-flex min-h-8 shrink-0 items-center justify-center rounded-full bg-slate-100 px-3 text-xs font-semibold text-slate-500">
                {sayHiLabel}
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSayHi();
                }}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] px-3.5 text-sm font-bold text-white hover:bg-[var(--brand-dark)]"
              >
                {sayHiLabel}
              </button>
            )
          ) : null}
        </div>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard
      as="article"
      interactive
      className="flex h-full w-full max-w-full min-w-0 flex-col overflow-hidden p-4 sm:p-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        <ProfilePreviewTrigger userId={profile.id} className="shrink-0">
          <PersonAvatar
            id={profile.id}
            name={profile.full_name}
            url={profile.avatar_url}
            size="md"
          />
        </ProfilePreviewTrigger>

        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 items-start gap-2">
            <ProfilePreviewTrigger userId={profile.id} className="min-w-0 flex-1">
              <h2
                title={name}
                className="min-w-0 truncate whitespace-nowrap text-base font-bold text-slate-900"
              >
                {name}
              </h2>
            </ProfilePreviewTrigger>
            {profile.linkedin_url ? (
              <a
                href={profile.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${name} on LinkedIn`}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 rounded-lg p-1.5 text-[#0A66C2] transition hover:bg-teal-50"
              >
                <LinkedInIcon />
              </a>
            ) : null}
          </div>
          {meta ? (
            <p
              title={meta}
              className="mt-1 min-w-0 truncate text-xs font-medium text-slate-500"
            >
              {meta}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 min-w-0 flex-1 space-y-2 overflow-hidden text-sm">
        {(roleTitle || company) && (
          <div className="min-w-0 overflow-hidden">
            {roleTitle && (
              <p
                title={roleTitle}
                className="truncate whitespace-nowrap font-semibold text-slate-800"
              >
                {roleTitle}
              </p>
            )}
            {company && (
              <p
                title={company}
                className="truncate whitespace-nowrap text-slate-600"
              >
                {company}
              </p>
            )}
          </div>
        )}
        {openTo.length > 0 && (
          <div className="flex min-w-0 flex-wrap gap-1.5 pt-1">
            {openTo.map((tag) => (
              <span
                key={tag}
                className="inline-flex max-w-full truncate rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800"
              >
                Open to {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {!isSelf && onSayHi && (
        sayHiDisabled ? (
          <div className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-500">
            {sayHiLabel}
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSayHi();
            }}
            className="btn-primary mt-4 w-full max-w-full"
          >
            {sayHiLabel}
          </button>
        )
      )}
    </SurfaceCard>
  );
}

function LinkedInIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}
