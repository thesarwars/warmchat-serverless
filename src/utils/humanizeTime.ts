// Make AI-generated task text user-friendly: turn raw ISO timestamps into a
// readable date/time and always show the STANDARD timezone abbreviation
// (e.g. PST, never PDT) per the workspace preference.
//
// The workspace timezone is Pacific (America/Los_Angeles); pass a different IANA
// zone if/when workspaces become multi-timezone.

const STD_ABBREV: Record<string, string> = {
  PDT: "PST",
  MDT: "MST",
  CDT: "CST",
  EDT: "EST",
  AKDT: "AKST",
  HDT: "HST",
};

const ISO_RE =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g;

function formatIsoInZone(iso: string, tz: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const raw = get("timeZoneName");
    const tzName = STD_ABBREV[raw] || raw;
    return `${get("month")} ${get("day")}, ${get("year")}, ${get("hour")}:${get("minute")} ${get("dayPeriod")}${tzName ? ` ${tzName}` : ""}`;
  } catch {
    return iso;
  }
}

/**
 * Humanize AI/task text for display: format embedded ISO timestamps in the
 * workspace timezone and normalize daylight abbreviations to standard
 * (PDT -> PST). Safe on plain text (no-ops when there's nothing to change).
 */
export function humanizeTaskText(
  text: string | null | undefined,
  tz: string = "America/Los_Angeles",
): string {
  if (!text) return "";
  let out = text.replace(ISO_RE, (m) => formatIsoInZone(m, tz));
  out = out.replace(/\b(PDT|MDT|CDT|EDT|AKDT|HDT)\b/g, (m) => STD_ABBREV[m] || m);
  return out;
}
