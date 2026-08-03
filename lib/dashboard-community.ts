import {
  getProfileRole,
  hasBatchYearPassed,
  type ProfileStatus,
} from "@/lib/network";

export type CommunityProfileRow = {
  id: string;
  full_name: string | null;
  batch_year: number | null;
  status: ProfileStatus | null;
  department: string | null;
  avatar_url: string | null;
};

export type CommunityAvatarSnippet = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export type CommunityBatchGroup = {
  year: number;
  count: number;
  /** Student/graduate tint from July cutoff on the batch year */
  tint: "student" | "graduate";
  isOwn: boolean;
};

export type CommunityDeptGroup = {
  department: string;
  count: number;
  avatars: CommunityAvatarSnippet[];
  isOwn: boolean;
};

export type CommunityStats = {
  total: number;
  students: number;
  graduates: number;
  batches: CommunityBatchGroup[];
  departments: CommunityDeptGroup[];
};

const COMMUNITY_SELECT =
  "id, full_name, batch_year, status, department, avatar_url";

export { COMMUNITY_SELECT };

/**
 * Aggregate authenticated-visible profiles into community browse groups.
 * Includes the viewer in totals/counts; avatar stacks prefer others.
 */
export function buildCommunityStats(
  profiles: CommunityProfileRow[],
  viewer: {
    id: string;
    batch_year: number | null;
    department: string | null;
  },
  now = new Date(),
): CommunityStats {
  let students = 0;
  let graduates = 0;

  const batchMap = new Map<number, number>();
  const deptMap = new Map<
    string,
    { count: number; avatars: CommunityAvatarSnippet[] }
  >();

  const ownDept = viewer.department?.trim() || null;

  for (const row of profiles) {
    const role = getProfileRole(row.status);
    if (role === "Graduate") graduates += 1;
    else students += 1;

    if (row.batch_year != null && Number.isFinite(row.batch_year)) {
      const year = Math.trunc(row.batch_year);
      batchMap.set(year, (batchMap.get(year) ?? 0) + 1);
    }

    const dept = row.department?.trim();
    if (dept) {
      let entry = deptMap.get(dept);
      if (!entry) {
        entry = { count: 0, avatars: [] };
        deptMap.set(dept, entry);
      }
      entry.count += 1;
      // Prefer others for stacks; still fill from self if needed later.
      if (row.id !== viewer.id && entry.avatars.length < 3) {
        entry.avatars.push({
          id: row.id,
          full_name: row.full_name,
          avatar_url: row.avatar_url,
        });
      }
    }
  }

  // Backfill avatar stacks with viewer if a dept still needs faces.
  if (ownDept) {
    const entry = deptMap.get(ownDept);
    const self = profiles.find((p) => p.id === viewer.id);
    if (entry && self && entry.avatars.length < 3) {
      const already = entry.avatars.some((a) => a.id === self.id);
      if (!already) {
        entry.avatars.push({
          id: self.id,
          full_name: self.full_name,
          avatar_url: self.avatar_url,
        });
      }
    }
  }

  const batches: CommunityBatchGroup[] = Array.from(batchMap.entries())
    .map(([year, count]) => ({
      year,
      count,
      tint: hasBatchYearPassed(year, now) ? ("graduate" as const) : ("student" as const),
      isOwn: viewer.batch_year != null && Math.trunc(viewer.batch_year) === year,
    }))
    .sort((a, b) => {
      if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
      return b.year - a.year;
    });

  const departments: CommunityDeptGroup[] = Array.from(deptMap.entries())
    .map(([department, { count, avatars }]) => ({
      department,
      count,
      avatars,
      isOwn: ownDept != null && department === ownDept,
    }))
    .sort((a, b) => {
      if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
      if (b.count !== a.count) return b.count - a.count;
      return a.department.localeCompare(b.department);
    });

  return {
    total: profiles.length,
    students,
    graduates,
    batches,
    departments,
  };
}
