import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Searchable timezone picker scoped to United States zones + all of Europe
 * (the only regions WarmChats serves). Backed by the IANA list
 * (Intl.supportedValuesOf) filtered to that scope, with a curated fallback for
 * old engines. Styled with inline styles only so it renders correctly both
 * inside the .wcv2 design system (where Tailwind utilities no-op) and on plain
 * Tailwind pages. The input can take a host className (e.g. wc-modal-input); the
 * dropdown is rendered through a portal with fixed positioning so it is never
 * clipped by an `overflow:hidden` ancestor (e.g. .wc-panel-card).
 */

// Every distinct United States IANA zone (one representative per offset/DST
// rule). Pacific (PST) is pinned first so it tops the unfiltered list; the rest
// follow Eastern -> Hawaii.
const US_ZONES = [
  "America/Los_Angeles",  // Pacific (PST) - pinned to top
  "America/New_York",     // Eastern
  "America/Detroit",
  "America/Indiana/Indianapolis",
  "America/Chicago",      // Central
  "America/Denver",       // Mountain
  "America/Boise",
  "America/Phoenix",      // Mountain (Arizona, no DST)
  "America/Anchorage",    // Alaska
  "America/Adak",         // Hawaii-Aleutian (with DST)
  "Pacific/Honolulu",     // Hawaii
];

const FALLBACK_ZONES = [
  ...US_ZONES,
  "Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Madrid",
  "Europe/Paris", "Europe/Berlin", "Europe/Rome", "Europe/Amsterdam",
  "Europe/Brussels", "Europe/Zurich", "Europe/Vienna", "Europe/Prague",
  "Europe/Warsaw", "Europe/Stockholm", "Europe/Copenhagen", "Europe/Oslo",
  "Europe/Helsinki", "Europe/Athens", "Europe/Bucharest", "Europe/Kyiv",
  "Europe/Istanbul", "Europe/Moscow",
];

// US zones first (in geographic order), then every Europe/* zone the engine knows.
function inScope(tz: string): boolean {
  return US_ZONES.includes(tz) || tz.startsWith("Europe/");
}

function allTimeZones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (typeof fn === "function") {
      const list = fn("timeZone");
      if (Array.isArray(list) && list.length) {
        const europe = list.filter((z) => z.startsWith("Europe/"));
        return [...US_ZONES, ...europe];
      }
    }
  } catch {
    /* fall through to the curated list */
  }
  return FALLBACK_ZONES.filter(inScope);
}

// Friendly name + abbreviations for each US zone so an average client can read
// and SEARCH by what they know ("PST", "Eastern", "Central") instead of the IANA
// city. `terms` are extra lowercase search keywords (abbreviations / state names).
const US_META: Record<string, { name: string; abbr: string; terms: string[] }> = {
  "America/New_York": { name: "Eastern Time", abbr: "EST/EDT", terms: ["est", "edt", "et", "eastern", "new york"] },
  "America/Detroit": { name: "Eastern Time - Detroit", abbr: "EST/EDT", terms: ["est", "edt", "et", "eastern", "detroit", "michigan"] },
  "America/Indiana/Indianapolis": { name: "Eastern Time - Indiana", abbr: "EST/EDT", terms: ["est", "edt", "et", "eastern", "indiana", "indianapolis"] },
  "America/Chicago": { name: "Central Time", abbr: "CST/CDT", terms: ["cst", "cdt", "ct", "central", "chicago", "texas"] },
  "America/Denver": { name: "Mountain Time", abbr: "MST/MDT", terms: ["mst", "mdt", "mt", "mountain", "denver", "colorado"] },
  "America/Boise": { name: "Mountain Time - Boise", abbr: "MST/MDT", terms: ["mst", "mdt", "mt", "mountain", "boise", "idaho"] },
  "America/Phoenix": { name: "Mountain Time - Arizona", abbr: "MST", terms: ["mst", "mt", "mountain", "arizona", "phoenix", "no dst"] },
  "America/Los_Angeles": { name: "Pacific Time", abbr: "PST/PDT", terms: ["pst", "pdt", "pt", "pacific", "los angeles", "california", "la"] },
  "America/Anchorage": { name: "Alaska Time", abbr: "AKST/AKDT", terms: ["akst", "akdt", "akt", "alaska", "anchorage"] },
  "America/Adak": { name: "Hawaii-Aleutian Time", abbr: "HST/HDT", terms: ["hst", "hdt", "hawaii", "aleutian", "adak"] },
  "Pacific/Honolulu": { name: "Hawaii Time", abbr: "HST", terms: ["hst", "hawaii", "honolulu", "no dst"] },
};

// Common abbreviations for European zones so "GMT"/"CET"/"EET" find them too.
const EUROPE_TERMS: Record<string, string[]> = {
  "Europe/London": ["gmt", "bst", "uk", "britain", "england"],
  "Europe/Dublin": ["gmt", "ist", "ireland"],
  "Europe/Lisbon": ["gmt", "wet", "portugal"],
};

function offsetLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
    const off = parts.find((p) => p.type === "timeZoneName")?.value;
    return off ? ` (${off})` : "";
  } catch {
    return "";
  }
}

function labelFor(tz: string): string {
  const meta = US_META[tz];
  if (meta) return `${meta.name} (${meta.abbr})${offsetLabel(tz)}`;
  // Europe: drop the "Europe/" prefix for a cleaner "Paris (GMT+1)" reading.
  return tz.replace(/^Europe\//, "").replace(/_/g, " ") + offsetLabel(tz);
}

// Everything a row can be matched against: its label, the raw zone, and the
// curated abbreviation/keyword terms (so typing "PST" or "central" hits).
function searchTextFor(tz: string, label: string): string {
  const terms = US_META[tz]?.terms ?? EUROPE_TERMS[tz] ?? [];
  return `${label} ${tz} ${terms.join(" ")}`.toLowerCase();
}

export function TimezonePicker({
  value,
  onChange,
  disabled = false,
  placeholder = "Search timezone...",
  inputClassName,
}: {
  value: string;
  onChange: (tz: string) => void;
  disabled?: boolean;
  placeholder?: string;
  inputClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  const options = useMemo(() => allTimeZones().map((z) => {
    const label = labelFor(z);
    return { z, label, search: searchTextFor(z, label) };
  }), []);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.search.includes(q)) : options;
    return list.slice(0, 200);
  }, [options, query]);

  // Position the portaled dropdown under the input, tracking scroll/resize.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const currentLabel = value ? labelFor(value) : "";
  const fallbackInput: React.CSSProperties = {
    width: "100%", height: 40, padding: "0 12px", borderRadius: 10,
    border: "1px solid var(--line, #E5E7EB)", background: "#fff", color: "inherit", font: "inherit",
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        type="text"
        className={inputClassName}
        disabled={disabled}
        value={open ? query : currentLabel}
        placeholder={value ? currentLabel : placeholder}
        onFocus={() => { if (!disabled) { setOpen(true); setQuery(""); } }}
        // Selecting an option keeps focus on the input (the option's mousedown
        // preventDefaults), so a later click fires no focus event - reopen here.
        onClick={() => { if (!disabled && !open) { setOpen(true); setQuery(""); } }}
        onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
        style={inputClassName ? undefined : fallbackInput}
        aria-label="Timezone"
      />
      {open && !disabled && rect
        ? createPortal(
            <div
              ref={popRef}
              style={{
                position: "fixed", top: rect.top, left: rect.left, width: rect.width, zIndex: 9999,
                maxHeight: 260, overflowY: "auto", background: "#fff",
                border: "1px solid var(--line, #E5E7EB)", borderRadius: 10,
                boxShadow: "0 12px 32px rgba(0,0,0,0.18)", padding: 4,
              }}
            >
              {filtered.length === 0 ? (
                <div style={{ padding: "10px 12px", fontSize: 13, color: "#6B7280" }}>No matching timezone</div>
              ) : (
                filtered.map((o) => (
                  <button
                    key={o.z}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); onChange(o.z); setOpen(false); setQuery(""); }}
                    style={{
                      display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
                      borderRadius: 8, border: "none", cursor: "pointer", font: "inherit", fontSize: 13,
                      background: o.z === value ? "var(--accent-soft, #FEF1E7)" : "transparent",
                      color: o.z === value ? "var(--accent-strong, #C2410C)" : "#111827",
                    }}
                  >
                    {o.label}
                  </button>
                ))
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
