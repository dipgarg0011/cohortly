/**
 * User-facing college label for logged-in UI.
 * Falls back to "your college" until multi-college (`colleges` /
 * `profiles.college_id`) ships and a name can be loaded from the DB.
 */
export function getCollegeDisplayName(
  collegeName?: string | null,
): string {
  const trimmed = collegeName?.trim();
  return trimmed || "your college";
}

/** Title-case community label, e.g. "Your college community". */
export function getCollegeCommunityLabel(
  collegeName?: string | null,
): string {
  const name = getCollegeDisplayName(collegeName);
  if (name === "your college") return "Your college community";
  return `${name} community`;
}
