import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { fetchOrgTimezone } from "@/helpers/backend";

// Short zone label for the common US timezones; falls back to the bare GMT
// offset abbreviation the browser produces for anything else. (Mirror of the
// table used by the Inbox ThreadClock so both clocks read the same.)
const TZ_ABBREV: Record<string, string> = {
  "America/New_York": "ET",
  "America/Chicago": "CT",
  "America/Denver": "MT",
  "America/Phoenix": "MST",
  "America/Los_Angeles": "PT",
  "America/Anchorage": "AKT",
  "Pacific/Honolulu": "HT",
};

function zoneAbbrev(timezone: string): string {
  const mapped = TZ_ABBREV[timezone];
  if (mapped) return mapped;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value || "";
  } catch {
    return "";
  }
}

function formatClockTime(now: Date, zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      ...(zone ? { timeZone: zone } : {}),
    }).format(now);
  } catch {
    return now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
}

function isValidZone(z: string): string {
  if (!z) return "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: z });
    return z;
  } catch {
    return "";
  }
}

/**
 * Resolve the workspace/account timezone (organization.timezone) once,
 * app-wide. Shares the ["org-timezone", orgId] query key with the AI Command
 * Center so it serves cached data instead of refetching. Returns null until
 * loaded or when no org row carries a zone.
 */
function useWorkspaceTimezone(): string | null {
  const orgId = localStorage.getItem("org_id") || "";
  const { data } = useQuery({
    queryKey: ["org-timezone", orgId],
    queryFn: () => fetchOrgTimezone(orgId) as Promise<{ timezone: string | null }>,
    enabled: Boolean(orgId),
    staleTime: 5 * 60 * 1000,
  });
  return data?.timezone ?? null;
}

/**
 * Small live clock for composer card headers. Shows the current time in the
 * workspace/account timezone (the user's zone) so an agent can see, at a
 * glance, what time it is for sending. Re-renders every 15s.
 *
 * Inline-styled on purpose: composer cards live both inside `.wcv2` (where
 * Tailwind utilities no-op) and in plain Tailwind dialogs, so a class-based
 * style would only land in one of them.
 */
export function LiveClock({
  timezone,
  style,
}: {
  // Optional explicit zone (e.g. a lead's). Defaults to the workspace zone.
  timezone?: string | null;
  style?: React.CSSProperties;
}) {
  const workspaceTz = useWorkspaceTimezone();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const handle = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(handle);
  }, []);

  const zone =
    isValidZone(timezone || "") ||
    isValidZone(workspaceTz || "") ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "";

  const time = formatClockTime(now, zone);
  const abbrev = zone ? zoneAbbrev(zone) : "";

  return (
    <span
      title={zone || undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 12,
        fontWeight: 600,
        color: "#6b7280",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      <Clock size={13} />
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{time}</span>
      {abbrev ? <span>{abbrev}</span> : null}
    </span>
  );
}
