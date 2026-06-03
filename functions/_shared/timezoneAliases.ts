/**
 * normalizeTimezone(input) accepts common US/abbreviation aliases ("PST",
 * "pacific", "us/pacific") and full IANA strings, returning the canonical
 * IANA zone (e.g. "America/Los_Angeles") or null when the input doesn't
 * resolve. Validation goes through Intl.DateTimeFormat, then the resolved
 * zone is constrained to the only regions WarmChats serves - the United
 * States and Europe (mirrors the frontend <TimezonePicker> scope). A valid
 * but out-of-scope zone (e.g. "Asia/Tokyo") resolves to null so callers fall
 * back to the org/area-code default instead of storing an unserved zone.
 */

// Every United States IANA zone (50 states + DC). Broader than the picker's
// representative list so a genuine browser- or area-code-detected US zone
// (e.g. "America/Detroit", "America/Juneau") still validates. Europe is matched
// by the "Europe/" prefix below rather than enumerated.
const US_IANA_ZONES = new Set([
  "America/New_York", "America/Detroit",
  "America/Kentucky/Louisville", "America/Kentucky/Monticello",
  "America/Indiana/Indianapolis", "America/Indiana/Vincennes",
  "America/Indiana/Winamac", "America/Indiana/Marengo",
  "America/Indiana/Petersburg", "America/Indiana/Vevay",
  "America/Chicago", "America/Indiana/Tell_City", "America/Indiana/Knox",
  "America/Menominee", "America/North_Dakota/Center",
  "America/North_Dakota/New_Salem", "America/North_Dakota/Beulah",
  "America/Denver", "America/Boise", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "America/Juneau",
  "America/Sitka", "America/Metlakatla", "America/Yakutat",
  "America/Nome", "America/Adak", "Pacific/Honolulu",
]);

// Restrict resolved zones to US + Europe (UTC/GMT stay valid as neutral defaults).
function timezoneInScope(zone: string): boolean {
  return zone === "UTC" || zone.startsWith("Europe/") || US_IANA_ZONES.has(zone);
}

const ALIASES: Record<string, string> = {
  // Pacific
  "pst": "America/Los_Angeles",
  "pdt": "America/Los_Angeles",
  "pt": "America/Los_Angeles",
  "pacific": "America/Los_Angeles",
  "pacific time": "America/Los_Angeles",
  "us/pacific": "America/Los_Angeles",

  // Mountain
  "mst": "America/Denver",
  "mdt": "America/Denver",
  "mt": "America/Denver",
  "mountain": "America/Denver",
  "mountain time": "America/Denver",
  "us/mountain": "America/Denver",
  "arizona": "America/Phoenix",
  "us/arizona": "America/Phoenix",

  // Central
  "cst": "America/Chicago",
  "cdt": "America/Chicago",
  "ct": "America/Chicago",
  "central": "America/Chicago",
  "central time": "America/Chicago",
  "us/central": "America/Chicago",

  // Eastern
  "est": "America/New_York",
  "edt": "America/New_York",
  "et": "America/New_York",
  "eastern": "America/New_York",
  "eastern time": "America/New_York",
  "us/eastern": "America/New_York",

  // Alaska & Hawaii
  "akst": "America/Anchorage",
  "akdt": "America/Anchorage",
  "alaska": "America/Anchorage",
  "us/alaska": "America/Anchorage",
  "hst": "Pacific/Honolulu",
  "hawaii": "Pacific/Honolulu",
  "us/hawaii": "Pacific/Honolulu",

  // Misc shortcuts
  "utc": "UTC",
  "gmt": "UTC",
};

function isValidIana(zone: string): boolean {
  try {
    // Throws RangeError for invalid zones.
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezone(input: string | null | undefined): string | null {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  // Aliases only ever map to in-scope US zones, so they pass straight through.
  if (ALIASES[lower]) return ALIASES[lower];

  // Normalize "us/pacific" or "US/Pacific" style explicitly above; otherwise
  // accept any string Intl can resolve as a timezone, then scope it to US/Europe.
  if (isValidIana(raw)) return timezoneInScope(raw) ? raw : null;

  // Try common case fixes: "america/los_angeles" -> "America/Los_Angeles".
  const titled = raw
    .split("/")
    .map((part) =>
      part
        .split("_")
        .map((seg) =>
          seg && seg.length > 0
            ? (seg[0] ?? "").toUpperCase() + seg.slice(1).toLowerCase()
            : seg,
        )
        .join("_"),
    )
    .join("/");
  if (isValidIana(titled)) return timezoneInScope(titled) ? titled : null;

  return null;
}
