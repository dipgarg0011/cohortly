export type CommunityProfileRow = {
  id: string;
  batch_year: number | null;
  status: string | null;
  department: string | null;
};

export type CommunityStats = {
  yourBatch: number;
  yourBranch: number;
  total: number;
  batchYear: number | null;
  department: string | null;
};

const COMMUNITY_SELECT = "id, batch_year, status, department";

export { COMMUNITY_SELECT };

/**
 * Aggregate authenticated-visible profiles into dashboard community counts.
 * Includes the viewer in totals/counts.
 */
export function buildCommunityStats(
  profiles: CommunityProfileRow[],
  viewer: {
    batch_year: number | null;
    department: string | null;
  },
): CommunityStats {
  const batchYear =
    viewer.batch_year != null && Number.isFinite(viewer.batch_year)
      ? Math.trunc(viewer.batch_year)
      : null;
  const department = viewer.department?.trim() || null;

  let yourBatch = 0;
  let yourBranch = 0;

  for (const row of profiles) {
    if (
      batchYear != null &&
      row.batch_year != null &&
      Number.isFinite(row.batch_year) &&
      Math.trunc(row.batch_year) === batchYear
    ) {
      yourBatch += 1;
    }

    if (department && row.department?.trim() === department) {
      yourBranch += 1;
    }
  }

  return {
    yourBatch: batchYear != null ? yourBatch : 0,
    yourBranch: department != null ? yourBranch : 0,
    total: profiles.length,
    batchYear,
    department,
  };
}
