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

/**
 * Interactive person mini-card for dense lists (dashboard suggestions, etc.).
 * Avatar/name open the shared profile preview; action buttons stay independent.
 */
export function PersonRow({
  profile,
  action,
  className = "",
}: Props) {
  const role = getProfileRole(profile.status);
  const name = profile.full_name?.trim() || "Unnamed member";
  const roleTitle =
    profile.role_title?.trim() || profile.current_job?.trim() || "";
  const company = profile.company?.trim() || "";
  const skills = (profile.skills ?? []).slice(0, 2);
  const substance =
    roleTitle || company
      ? [roleTitle, company].filter(Boolean).join(" · ")
      : null;

  return (
    <article
      className={`person-row group flex w-full min-w-0 items-center gap-3 ${className}`}
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
        <div className="flex min-w-0 items-center gap-2">
          <ProfilePreviewTrigger userId={profile.id} className="min-w-0 flex-1">
            <h3
              title={name}
              className="min-w-0 truncate text-[15px] font-bold leading-tight text-slate-900 group-hover:text-teal-900"
            >
              {name}
            </h3>
          </ProfilePreviewTrigger>
          <StatusBadge role={role} className="shrink-0" />
        </div>
        {substance ? (
          <p
            title={substance}
            className="mt-0.5 truncate text-xs font-medium text-slate-600"
          >
            {substance}
          </p>
        ) : skills.length > 0 ? (
          <div className="mt-1 flex min-w-0 flex-wrap gap-1">
            {skills.map((skill) => (
              <span
                key={skill}
                className="inline-flex max-w-[9rem] truncate rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
              >
                {skill}
              </span>
            ))}
          </div>
        ) : profile.department?.trim() ? (
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {profile.department.trim()}
            {profile.batch_year != null ? ` · ${profile.batch_year}` : ""}
          </p>
        ) : null}
      </div>
      {action ? (
        <div
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {action}
        </div>
      ) : null}
    </article>
  );
}
