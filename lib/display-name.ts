/**
 * Compact display name for dense lists (messages, person rows).
 * Strips degree / college suffixes commonly pasted from LinkedIn, e.g.
 * "Rushikesh Khedkar 4-Yr B.Tech.: Metallurgical Engg., IIT(BHU)"
 * → "Rushikesh Khedkar"
 *
 * Keep the raw full_name on profile pages and previews.
 */

const DEGREE_OR_COLLEGE_SUFFIX =
  /\s+(?:\d+\s*-?\s*Yr\.?|B\.?\s*Tech\.?|B\.?\s*E\.?|M\.?\s*Tech\.?|M\.?\s*E\.?|M\.?\s*S\.?|B\.?\s*S\.?|B\.?\s*Sc\.?|M\.?\s*Sc\.?|MBA\b|Ph\.?\s*D\.?|Integrated\b|Dual\s+Degree\b|IIT\b|NIT\b|BITS\b|IIIT\b).*$/i;

export function compactDisplayName(
  fullName: string | null | undefined,
  fallback = "Unnamed member",
): string {
  const trimmed = fullName?.trim();
  if (!trimmed) return fallback;

  const stripped = trimmed
    .replace(DEGREE_OR_COLLEGE_SUFFIX, "")
    .replace(/[,:;|/\-–—]+\s*$/g, "")
    .trim();

  return stripped || trimmed;
}
