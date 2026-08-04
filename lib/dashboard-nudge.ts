import type { ProfileCompletionFields } from "@/lib/profile-completion";
import { getProfileCompletion } from "@/lib/profile-completion";

export type CaughtUpNudge = {
  text: string;
  href: string;
  actionLabel: string;
};

/**
 * When Needs you is empty, surface ONE suggested action.
 * Priority (highest first):
 * 1. Missing company — unlocks referrals for juniors
 * 2. New people in the viewer's branch this week — timely social signal
 * 3. Any other profile completion tip
 * 4. null → UI shows plain "You're all caught up"
 *
 * Never show this nudge alongside the separate profile tip banner —
 * callers should hide the banner whenever Needs you is empty.
 */
export function pickCaughtUpNudge(input: {
  profile: ProfileCompletionFields | null;
  newBranchJoins: number;
  department: string | null;
}): CaughtUpNudge | null {
  const { profile, newBranchJoins, department } = input;
  if (!profile) return null;

  const companyMissing = !profile.company?.trim();
  if (companyMissing) {
    return {
      text: "Add your company so juniors can find you for referrals",
      href: "/profile",
      actionLabel: "Edit profile",
    };
  }

  if (newBranchJoins > 0 && department?.trim()) {
    const n = newBranchJoins;
    return {
      text:
        n === 1
          ? "1 new person joined your branch this week"
          : `${n} new people joined your branch this week`,
      href: `/network?dept=${encodeURIComponent(department.trim())}`,
      actionLabel: "Meet them",
    };
  }

  const { nextTip, percent } = getProfileCompletion(profile);
  if (percent < 100 && nextTip) {
    return {
      text: nextTip,
      href: "/profile",
      actionLabel: "Edit profile",
    };
  }

  return null;
}
