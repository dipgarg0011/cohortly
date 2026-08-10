"use client";

import type { ReactNode } from "react";
import {
  formatCohortLockup,
  getProfileRole,
  type NetworkProfile,
} from "@/lib/network";
import { compactDisplayName } from "@/lib/display-name";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { ProfilePreviewTrigger } from "@/components/profile-preview";

type Props = {
  profile: NetworkProfile;
  action?: ReactNode;
  className?: string;
  /** When true, omit outer card chrome (parent list provides border). */
  flush?: boolean;
};

/**
 * Mobile-matched person row for dense lists (dashboard suggestions):
 * [avatar] Name                         [Connect]
 *          MET · 2028 · Student
 */
export function PersonRow({
  profile,
  action,
  className = "",
  flush = false,
}: Props) {
  const role = getProfileRole(profile.status);
  const fullName = profile.full_name?.trim() || "Unnamed member";
  const name = compactDisplayName(profile.full_name);
  const cohort = formatCohortLockup(profile.batch_year, profile.department);
  const meta = [
    cohort,
    role,
    profile.is_founder ? "Founder" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      className={`group flex w-full min-w-0 items-center gap-3 ${
        flush
          ? "px-3 py-3 sm:px-3.5"
          : "rounded-2xl border border-teal-900/8 bg-white px-3 py-3"
      } ${className}`}
    >
      <ProfilePreviewTrigger userId={profile.id} className="shrink-0">
        <PersonAvatar
          id={profile.id}
          name={profile.full_name}
          url={profile.avatar_url}
          size="md"
        />
      </ProfilePreviewTrigger>
      <div className="min-w-0 flex-1 overflow-hidden">
        <ProfilePreviewTrigger
          userId={profile.id}
          className="block min-w-0 overflow-hidden"
        >
          <h3
            title={fullName}
            className="block min-w-0 truncate text-base font-bold leading-snug text-slate-900 group-hover:text-teal-900"
          >
            {name}
          </h3>
        </ProfilePreviewTrigger>
        {meta ? (
          <p
            title={meta}
            className="mt-0.5 min-w-0 truncate text-xs font-medium leading-4 text-slate-500"
          >
            {meta}
          </p>
        ) : null}
      </div>
      {action ? (
        <div
          className="flex shrink-0 justify-end"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {action}
        </div>
      ) : null}
    </article>
  );
}
