// Shared tone palette ported from the "leads-remix-2" design bundle (data.jsx).
// Maps a tone key to icon foreground/background colors used across the v2
// prototype pages (KPIs, stat icons, pills, etc.).
export interface Tone {
  fg: string;
  bg: string;
}

export const TONES: Record<string, Tone> = {
  orange: { fg: "#EA580C", bg: "#FFF1E7" },
  amber: { fg: "#D97706", bg: "#FEF5E5" },
  indigo: { fg: "#4F46E5", bg: "#ECEDFD" },
  blue: { fg: "#2563EB", bg: "#EAF1FE" },
  green: { fg: "#16A34A", bg: "#E8F8ED" },
  teal: { fg: "#0D9488", bg: "#E3F6F2" },
  violet: { fg: "#7C3AED", bg: "#F2ECFE" },
  emerald: { fg: "#059669", bg: "#E6F7EF" },
  aiblue: { fg: "#3A93C9", bg: "#E3F4FC" },
};
