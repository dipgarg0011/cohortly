"use client";

import type { ReactNode } from "react";
import {
  getProfileRole,
  type NetworkProfile,
} from "@/lib/network";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProfilePreviewTrigger } from "@/components/profile-preview";

type Props = {
  profile: NetworkProfile;
  action?: ReactNode;
  className?: string;
};

function looksLikeStatusLabel(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "student" ||
    normalized === "graduate" ||
    normalized === "alumni" ||
    normalized === "grad"
  );
}

/**
 * Interactive person mini-card for dense lists (dashboard suggestions, etc.).
 * Avatar/name open the shared profile preview; action buttons stay independent.
 *
 * Uses @container so secondary chrome drops based on the row's own width
 * (works in half-width columns, not only viewport breakpoints).
 * Shrink order: button label → skill pills → dept/year → badge → name.
 */
export function PersonRow({
  profile,
  action,
  className = "",
}: Props) {
  const role = getProfileRole(profile.status);
  const name = profile.full_name?.trim() || "Unnamed member";

  const rawRoleTitle =
    profile.role_title?.trim() || profile.current_job?.trim() || "";
  const roleTitle =
    rawRoleTitle && !looksLikeStatusLabel(rawRoleTitle) ? rawRoleTitle : "";
  const companyRaw = profile.company?.trim() || "";
  const company =
    companyRaw && !looksLikeStatusLabel(companyRaw) ? companyRaw : "";
  const skills = (profile.skills ?? []).slice(0, 2);

  const substance =
    roleTitle || company
      ? [roleTitle, company].filter(Boolean).join(" · ")
      : null;

  const department = profile.department?.trim() || "";
  const departmentMeta =
    department && !looksLikeStatusLabel(department)
      ? `${department}${
          profile.batch_year != null ? ` · ${profile.batch_year}` : ""
        }`
      : profile.batch_year != null
        ? `Batch ${profile.batch_year}`
        : null;

  return (
    <article
      className={`@container/pr person-row group flex w-full min-w-0 items-center gap-2 @[18rem]/pr:gap-3 ${className}`}
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
        <div className="flex min-w-0 items-center gap-1.5 @[16rem]/pr:gap-2">
          <ProfilePreviewTrigger
            userId={profile.id}
            className="block min-w-[10ch] flex-1 overflow-hidden"
          >
            <h3
              title={name}
              className="block min-w-0 truncate text-[0.9375rem] font-bold leading-tight text-slate-900 group-hover:text-teal-900"
            >
              {name}
            </h3>
          </ProfilePreviewTrigger>
          <StatusBadge
            role={role}
            className="hidden shrink-0 @[13rem]/pr:inline-flex"
          />
        </div>
        {/* Meta line: drop skills then dept/year as the container narrows. */}
        <div className="mt-0.5 flex h-4 min-w-0 items-center overflow-hidden">
          {substance ? (
            <p
              title={substance}
              className="hidden min-w-0 truncate text-xs font-medium leading-4 text-slate-600 @[16rem]/pr:block"
            >
              {substance}
            </p>
          ) : skills.length > 0 ? (
            <div className="hidden min-w-0 flex-nowrap items-center gap-1 overflow-hidden @[20rem]/pr:flex">
              {skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex max-w-[9rem] min-w-0 truncate rounded-full bg-slate-100 px-2 py-0 text-[10px] font-semibold leading-4 text-slate-600"
                >
                  {skill}
                </span>
              ))}
            </div>
          ) : departmentMeta ? (
            <p
              title={departmentMeta}
              className="hidden min-w-0 truncate text-xs leading-4 text-slate-500 @[16rem]/pr:block"
            >
              {departmentMeta}
            </p>
          ) : null}
        </div>
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
