import {
  getInitials,
  getProfileRole,
  type NetworkProfile,
} from "@/lib/network";
import { SurfaceCard } from "@/components/ui/surface-card";

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

const ACCENT_RING = {
  network: "ring-sky-100",
  mentors: "ring-amber-100",
  referrals: "ring-rose-100",
  opportunities: "ring-indigo-100",
};

export function ProfileCard({
  profile,
  currentYear = new Date().getFullYear(),
  isSelf = false,
  onSayHi,
  sayHiLabel = "Send Request",
  sayHiDisabled = false,
  dense = false,
  accent = "network",
}: Props) {
  void currentYear;
  const role = getProfileRole(profile.status);
  const name = profile.full_name?.trim() || "Unnamed member";
  const isStudent = role === "Student";
  const roleTitle =
    profile.role_title?.trim() || profile.current_job?.trim() || "";
  const company = profile.company?.trim() || "";
  const openTo = profile.open_to ?? [];
  const department = profile.department?.trim() || "";

  if (dense) {
    return (
      <SurfaceCard
        as="article"
        interactive
        className="w-full max-w-full min-w-0 overflow-hidden !rounded-xl px-2.5 py-2"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Avatar
            name={profile.full_name}
            url={profile.avatar_url}
            ring={ACCENT_RING[accent]}
            size="sm"
          />
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 items-center gap-1.5">
              <h2
                title={name}
                className="min-w-0 flex-1 truncate whitespace-nowrap text-sm font-bold text-slate-900"
              >
                {name}
              </h2>
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  isStudent
                    ? "bg-teal-50 text-teal-800"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {role}
              </span>
              {profile.batch_year != null && (
                <span className="shrink-0 text-[10px] font-medium text-slate-500">
                  {profile.batch_year}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2">
              <p
                title={department || roleTitle || company || undefined}
                className="min-w-0 flex-1 truncate whitespace-nowrap text-xs text-slate-500"
              >
                {department || roleTitle || company || "—"}
              </p>
              {!isSelf && onSayHi && (
                <button
                  type="button"
                  onClick={onSayHi}
                  disabled={sayHiDisabled}
                  className="shrink-0 rounded-md bg-[var(--brand)] px-2 py-0.5 text-[11px] font-bold leading-5 text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {sayHiLabel}
                </button>
              )}
            </div>
          </div>
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
        <Avatar
          name={profile.full_name}
          url={profile.avatar_url}
          ring={ACCENT_RING[accent]}
        />

        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 items-start gap-2">
            <h2
              title={name}
              className="min-w-0 flex-1 truncate whitespace-nowrap text-base font-bold text-slate-900"
            >
              {name}
            </h2>
            {profile.linkedin_url ? (
              <a
                href={profile.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${name} on LinkedIn`}
                className="shrink-0 rounded-lg p-1.5 text-[#0A66C2] transition hover:bg-sky-50"
              >
                <LinkedInIcon />
              </a>
            ) : null}
          </div>
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                isStudent
                  ? "bg-teal-50 text-teal-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {role}
            </span>
            {profile.is_founder && (
              <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">
                Founder
              </span>
            )}
            {profile.batch_year != null && (
              <span className="meta-text">Batch {profile.batch_year}</span>
            )}
          </div>
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
        {department && (
          <div className="flex min-w-0 items-center gap-2">
            <p
              title={department}
              className="min-w-0 flex-1 truncate whitespace-nowrap text-slate-500"
            >
              {department}
            </p>
            {!isSelf && onSayHi && (
              <button
                type="button"
                onClick={onSayHi}
                disabled={sayHiDisabled}
                className="shrink-0 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-55 sm:hidden"
              >
                {sayHiLabel}
              </button>
            )}
          </div>
        )}
        {!department && !isSelf && onSayHi && (
          <div className="flex justify-end sm:hidden">
            <button
              type="button"
              onClick={onSayHi}
              disabled={sayHiDisabled}
              className="shrink-0 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {sayHiLabel}
            </button>
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
        <button
          type="button"
          onClick={onSayHi}
          disabled={sayHiDisabled}
          className="btn-primary mt-4 hidden w-full max-w-full disabled:cursor-not-allowed disabled:opacity-55 sm:block"
        >
          {sayHiLabel}
        </button>
      )}
    </SurfaceCard>
  );
}

function Avatar({
  name,
  url,
  ring,
  size = "md",
}: {
  name: string | null;
  url: string | null;
  ring: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-8 w-8 text-[10px]" : "h-12 w-12";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={`${dim} shrink-0 rounded-full object-cover ring-2 ${ring}`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-teal-100 font-bold text-teal-800`}
    >
      {getInitials(name)}
    </div>
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
