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
  accent = "network",
}: Props) {
  const role = getProfileRole(profile.batch_year, currentYear);
  const name = profile.full_name?.trim() || "Unnamed member";
  const isStudent = role === "Student";
  const roleTitle =
    profile.role_title?.trim() || profile.current_job?.trim() || "";
  const company = profile.company?.trim() || "";
  const openTo = profile.open_to ?? [];

  return (
    <SurfaceCard
      as="article"
      interactive
      className="flex h-full w-full max-w-full min-w-0 flex-col overflow-hidden p-4 sm:p-5"
    >
      <div className="flex min-w-0 items-start gap-3">
        {profile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt=""
            className={`h-12 w-12 shrink-0 rounded-full object-cover ring-2 ${ACCENT_RING[accent]}`}
          />
        ) : (
          <div
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-100 font-bold text-teal-800"
          >
            {getInitials(profile.full_name)}
          </div>
        )}

        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex min-w-0 items-start gap-2">
            <h2 className="min-w-0 flex-1 text-base font-bold leading-snug text-slate-900 [overflow-wrap:anywhere] line-clamp-2">
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
              <p className="line-clamp-2 font-semibold text-slate-800 [overflow-wrap:anywhere]">
                {roleTitle}
              </p>
            )}
            {company && (
              <p className="line-clamp-1 text-slate-600 [overflow-wrap:anywhere]">
                {company}
              </p>
            )}
          </div>
        )}
        {profile.department?.trim() && (
          <p className="line-clamp-2 text-slate-500 [overflow-wrap:anywhere]">
            {profile.department.trim()}
          </p>
        )}
        {openTo.length > 0 && (
          <div className="flex min-w-0 flex-wrap gap-1.5 pt-1">
            {openTo.map((tag) => (
              <span
                key={tag}
                className="inline-flex max-w-full rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800 [overflow-wrap:anywhere]"
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
          className="btn-primary mt-4 w-full max-w-full disabled:cursor-not-allowed disabled:opacity-55"
        >
          {sayHiLabel}
        </button>
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
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}
