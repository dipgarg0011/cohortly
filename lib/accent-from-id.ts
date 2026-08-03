/** Stable accent from a user id — same person, same colour. */
export type AccentTone = {
  soft: string;
  solid: string;
  ring: string;
};

const TONES: AccentTone[] = [
  {
    soft: "var(--accent-network-soft)",
    solid: "var(--accent-network)",
    ring: "rgba(2,132,199,0.35)",
  },
  {
    soft: "var(--accent-messages-soft)",
    solid: "var(--accent-messages)",
    ring: "rgba(13,148,136,0.35)",
  },
  {
    soft: "var(--accent-mentors-soft)",
    solid: "var(--accent-mentors)",
    ring: "rgba(217,119,6,0.35)",
  },
  {
    soft: "var(--accent-opportunities-soft)",
    solid: "var(--accent-opportunities)",
    ring: "rgba(79,70,229,0.35)",
  },
  {
    soft: "var(--accent-referrals-soft)",
    solid: "var(--accent-referrals)",
    ring: "rgba(225,29,72,0.28)",
  },
  {
    soft: "var(--brand-soft)",
    solid: "var(--brand)",
    ring: "rgba(15,118,110,0.35)",
  },
];

export function accentFromId(id: string): AccentTone {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return TONES[hash % TONES.length]!;
}
