import { useMemo, useState, useRef, useEffect, type ComponentType, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { startOfWeek, addDays, startOfMonth, isSameDay, isSameMonth } from "date-fns";
import { Phone, Video, MapPin } from "lucide-react";
import MainLayout from "./MainLayout";
import { useFetch } from "@/helpers/hooks";
import { fetchOrgAppointments, createOrgAppointment, searchOrgLeads } from "@/helpers/backend";
import { Icon } from "./ai-v2/Icon";
import "./ai-v2/prototype.css";

/* Calendar - reskinned to the "leads-remix-2" design (calendar.jsx) on top of
   the live data layer: appointments are loaded from fetchOrgAppointments (the
   single source of truth) and created via createOrgAppointment, which persists
   server-side; the page then refetches. No mock/seed data - an org with no
   appointments shows empty states. The whole page renders through the
   prototype's .wc-* classes pinned under the .wcv2 wrapper (prototype.css). */

// -- Data model (unchanged - shared with the appointments API) ----
type Variant = "default" | "hot" | "featured" | "muted";

interface Appt {
  id: number;
  lead_id: number | null;
  title: string;
  subtitle: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  variant: Variant;
  status: string;
  notes: string;
  meeting_type: string | null;
}

interface ApiApptRow {
  id: number;
  lead_id: number | null;
  title: string;
  starts_at: string | null;
  ends_at?: string | null;
  meeting_type: string | null;
  status: string | null;
  notes: string | null;
  external_meeting_url: string | null;
  with_name: string | null;
}

// A lead option for the create modal's optional lead picker (from the full org
// leads list, so brand-new leads with no message history are searchable too).
interface LeadOption {
  id: number;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
}

// -- Design tokens (from calendar.jsx) ----
type Kind = "Showing" | "Consultation" | "Listing" | "Call" | "Zoom";
const APPT_KINDS: Record<Kind, { fg: string; bg: string; bar: string }> = {
  Showing: { fg: "#0D9488", bg: "#E3F6F2", bar: "#14B8A6" },
  Consultation: { fg: "#4F46E5", bg: "#ECEDFD", bar: "#6366F1" },
  Listing: { fg: "#EA580C", bg: "#FFF1E7", bar: "#F97316" },
  Call: { fg: "#2563EB", bg: "#EAF1FE", bar: "#3B82F6" },
  Zoom: { fg: "#7C3AED", bg: "#F2ECFE", bar: "#8B5CF6" },
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Full 24h grid (0-24) so no hours are hidden; the grid scrolls and opens scrolled
// to the morning (SCROLL_TO_HOUR) via the scroll-container ref in the page body.
const DAY_START = 0, DAY_END = 24, ROW_H = 54, SCROLL_TO_HOUR = 7;

// -- Helpers ----
const ymd = (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const hourLabel = (h: number) => { const ap = h < 12 ? "am" : "pm"; const hr = h % 12 === 0 ? 12 : h % 12; return hr + ap; };
const timeLabel = (h: number) => { const hh = Math.floor(h); const mm = Math.round((h - hh) * 60); const ap = hh < 12 ? "AM" : "PM"; const hr = hh % 12 === 0 ? 12 : hh % 12; return hr + (mm ? ":" + String(mm).padStart(2, "0") : "") + " " + ap; };

const kindFor = (a: Appt): Kind => {
  const mt = (a.meeting_type || "").toLowerCase();
  const t = (a.title || "").toLowerCase();
  if (mt === "phone") return "Call";
  if (mt === "zoom" || mt === "google_meet" || mt === "video" || /zoom/.test(t)) return "Zoom";
  if (/listing/.test(t)) return "Listing";
  if (/consult/.test(t)) return "Consultation";
  if (/show|tour|open\s*house/.test(t)) return "Showing";
  return "Consultation";
};
const locFor = (a: Appt): string => {
  const mt = (a.meeting_type || "").toLowerCase();
  if (mt === "phone") return "Phone";
  if (mt === "zoom" || mt === "google_meet" || mt === "video") return "Video call";
  if (mt === "in_person") return "In person";
  return mt ? mt.replace(/_/g, " ") : "In person";
};

// Render model: a real Appt projected onto the design's day/time grid.
interface RApt {
  id: number;
  lead_id: number | null;
  date: string;
  start: number;
  dur: number;
  kind: Kind;
  title: string;
  who: string;
  loc: string;
  allDay: boolean;
}
const toRender = (a: Appt): RApt => {
  const s = new Date(a.starts_at);
  const e = new Date(a.ends_at);
  const start = s.getHours() + s.getMinutes() / 60;
  const dur = Math.max(0.5, (e.getTime() - s.getTime()) / 3_600_000);
  return { id: a.id, lead_id: a.lead_id, date: ymd(s), start, dur, kind: kindFor(a), title: a.title, who: a.subtitle || "", loc: locFor(a), allDay: a.all_day };
};
const apptsOn = (appts: RApt[], d: Date) => appts.filter((a) => a.date === ymd(d)).sort((x, y) => x.start - y.start);

// Group events whose time ranges overlap, so a stack of simultaneous meetings can
// be paged through with prev/next arrows (day/week views) instead of the lower
// ones hiding behind the top one.
const clusterOverlaps = (appts: RApt[]): RApt[][] => {
  const sorted = [...appts].sort((a, b) => a.start - b.start);
  const clusters: RApt[][] = [];
  let cur: RApt[] = [];
  let curEnd = -Infinity;
  for (const a of sorted) {
    const end = a.start + a.dur;
    if (cur.length && a.start < curEnd - 1e-9) {
      cur.push(a);
      curEnd = Math.max(curEnd, end);
    } else {
      if (cur.length) clusters.push(cur);
      cur = [a];
      curEnd = end;
    }
  }
  if (cur.length) clusters.push(cur);
  return clusters;
};

const apiToAppt = (a: ApiApptRow): Appt | null => {
  if (!a.starts_at) return null;
  const start = new Date(a.starts_at);
  const end = a.ends_at ? new Date(a.ends_at) : new Date(start.getTime() + 60 * 60_000);
  const s = String(a.status ?? "").toLowerCase();
  const t = String(a.title ?? "").toLowerCase();
  let variant: Variant = "default";
  if (s === "proposed" || /follow|hot/.test(t)) variant = "hot";
  if (/open\s*house/.test(t)) variant = "featured";
  return {
    id: a.id, lead_id: a.lead_id, title: a.title || "Appointment", subtitle: a.with_name,
    starts_at: start.toISOString(), ends_at: end.toISOString(), all_day: false,
    variant, status: a.status ?? "proposed", notes: a.notes ?? "", meeting_type: a.meeting_type,
  };
};

// -- Mini month picker ----
function MiniCal({ selected, onPick, month, setMonth, appts, today }: {
  selected: Date; onPick: (d: Date) => void; month: Date; setMonth: (d: Date) => void; appts: RApt[]; today: Date;
}) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="wc-mini">
      <div className="wc-mini-head">
        <span>{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
        <div className="wc-mini-nav">
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="chevronRight" size={15} style={{ transform: "rotate(180deg)" }} /></button>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="chevronRight" size={15} /></button>
        </div>
      </div>
      <div className="wc-mini-dow">{DOW.map((d) => <span key={d}>{d[0]}</span>)}</div>
      <div className="wc-mini-grid">
        {cells.map((c, i) => {
          const out = c.getMonth() !== month.getMonth();
          const isT = isSameDay(c, today);
          const isSel = isSameDay(c, selected);
          const has = apptsOn(appts, c).length > 0;
          return (
            <button key={i} className={"wc-mini-day" + (out ? " out" : "") + (isT ? " today" : "") + (isSel ? " sel" : "")} onClick={() => onPick(c)}>
              {c.getDate()}{has && !isSel && <span className="wc-mini-dot" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventChip({ a, onClick }: { a: RApt; onClick: () => void }) {
  const k = APPT_KINDS[a.kind];
  const top = (a.start - DAY_START) * ROW_H + 1;
  const h = a.dur * ROW_H - 3;
  return (
    <button className="wc-evt" style={{ top, height: h, background: k.bg, borderLeft: "3px solid " + k.bar, color: k.fg }} onClick={onClick}>
      <div className="wc-evt-t">{a.title}</div>
      <div className="wc-evt-m">{timeLabel(a.start)}{a.who ? " · " + a.who : ""}</div>
    </button>
  );
}

// A cluster of overlapping events drawn as one chip with a prev/next arrow pager
// and an "n/total" counter, so simultaneous meetings can be cycled and opened.
function StackChip({ cluster, onOpen }: { cluster: RApt[]; onOpen: (a: RApt) => void }) {
  const [idx, setIdx] = useState(0);
  const i = ((idx % cluster.length) + cluster.length) % cluster.length;
  const active = cluster[i];
  const k = APPT_KINDS[active.kind];
  const minStart = Math.min(...cluster.map((a) => a.start));
  const maxEnd = Math.max(...cluster.map((a) => a.start + a.dur));
  const top = (minStart - DAY_START) * ROW_H + 1;
  const height = Math.max(ROW_H - 3, (maxEnd - minStart) * ROW_H - 3);
  const navBtn: CSSProperties = { display: "flex", alignItems: "center", cursor: "pointer", color: k.fg };
  return (
    <div className="wc-evt" style={{ top, height, background: k.bg, borderLeft: "3px solid " + k.bar, color: k.fg, cursor: "pointer" }}
      onClick={() => onOpen(active)} title={cluster.length + " overlapping meetings"}>
      <div className="wc-evt-t">{active.title}</div>
      <div className="wc-evt-m">{timeLabel(active.start)}{active.who ? " · " + active.who : ""}</div>
      <div style={{ position: "absolute", bottom: 3, right: 5, display: "flex", alignItems: "center", gap: 3, padding: "1px 4px", borderRadius: 6, background: k.bg, border: "1px solid " + k.bar }}
        onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Previous meeting" style={navBtn} onClick={() => setIdx((v) => v - 1)}><Icon name="chevronRight" size={12} style={{ transform: "rotate(180deg)" }} /></button>
        <span style={{ fontSize: 10.5, fontWeight: 700 }}>{i + 1}/{cluster.length}</span>
        <button type="button" aria-label="Next meeting" style={navBtn} onClick={() => setIdx((v) => v + 1)}><Icon name="chevronRight" size={12} /></button>
      </div>
    </div>
  );
}

// A day column's events: overlapping ones collapse into a paged StackChip.
function DayEvents({ appts, onOpen }: { appts: RApt[]; onOpen: (a: RApt) => void }) {
  const clusters = clusterOverlaps(appts.filter((a) => !a.allDay));
  return (
    <>
      {clusters.map((cl, i) =>
        cl.length === 1
          ? <EventChip key={i} a={cl[0]} onClick={() => onOpen(cl[0])} />
          : <StackChip key={i} cluster={cl} onOpen={onOpen} />,
      )}
    </>
  );
}

interface GridHandlers {
  onOpen: (a: RApt) => void;
  onSlot: (d: Date, h: number) => void;
}

function WeekView({ week, appts, onSelectDay, today, ...h }: { week: Date[]; appts: RApt[]; onSelectDay: (d: Date) => void; today: Date } & GridHandlers) {
  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
  return (
    <div className="wc-cal-grid">
      <div className="wc-cal-corner" />
      <div className="wc-cal-days">
        {week.map((d, i) => (
          <button key={i} className={"wc-cal-dayhead" + (isSameDay(d, today) ? " today" : "")} onClick={() => onSelectDay(d)}>
            <span className="wc-cal-dow">{DOW[d.getDay()]}</span>
            <span className="wc-cal-dnum">{d.getDate()}</span>
          </button>
        ))}
      </div>
      <div className="wc-cal-times">
        {hours.map((hr) => <div key={hr} className="wc-cal-time" style={{ height: ROW_H }}><span>{hourLabel(hr)}</span></div>)}
      </div>
      <div className="wc-cal-cols">
        {week.map((d, i) => (
          <div key={i} className={"wc-cal-col" + (isSameDay(d, today) ? " today" : "")} style={{ height: (DAY_END - DAY_START) * ROW_H }}>
            {hours.map((hr) => <div key={hr} className="wc-cal-slot" style={{ height: ROW_H }} onClick={() => h.onSlot(d, hr)} />)}
            <DayEvents appts={apptsOn(appts, d)} onOpen={h.onOpen} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DayView({ day, appts, today, ...h }: { day: Date; appts: RApt[]; today: Date } & GridHandlers) {
  const hours = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
  return (
    <div className="wc-cal-grid day">
      <div className="wc-cal-corner" />
      <div className="wc-cal-days"><div className={"wc-cal-dayhead" + (isSameDay(day, today) ? " today" : "")}><span className="wc-cal-dow">{DOW_FULL[day.getDay()]}</span><span className="wc-cal-dnum">{day.getDate()}</span></div></div>
      <div className="wc-cal-times">{hours.map((hr) => <div key={hr} className="wc-cal-time" style={{ height: ROW_H }}><span>{hourLabel(hr)}</span></div>)}</div>
      <div className="wc-cal-cols">
        <div className="wc-cal-col" style={{ height: (DAY_END - DAY_START) * ROW_H }}>
          {hours.map((hr) => <div key={hr} className="wc-cal-slot" style={{ height: ROW_H }} onClick={() => h.onSlot(day, hr)} />)}
          <DayEvents appts={apptsOn(appts, day)} onOpen={h.onOpen} />
        </div>
      </div>
    </div>
  );
}

function MonthView({ month, appts, onOpen, onCreateDay, onShowDay, today }: {
  month: Date; appts: RApt[]; onOpen: (a: RApt) => void; onCreateDay: (d: Date) => void; onShowDay: (d: Date) => void; today: Date;
}) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div className="wc-month">
      <div className="wc-month-dow">{DOW.map((d) => <span key={d}>{d}</span>)}</div>
      <div className="wc-month-grid">
        {cells.map((c, i) => {
          const out = !isSameMonth(c, month);
          const evs = apptsOn(appts, c);
          return (
            <div key={i} className={"wc-month-cell" + (out ? " out" : "") + (isSameDay(c, today) ? " today" : "")} onClick={() => onCreateDay(c)}>
              <div className="wc-month-num">{c.getDate()}</div>
              {evs.slice(0, 3).map((a, j) => {
                const k = APPT_KINDS[a.kind];
                return <div key={j} className="wc-month-evt" style={{ background: k.bg, color: k.fg }} onClick={(e) => { e.stopPropagation(); onOpen(a); }}><span style={{ background: k.bar }} />{timeLabel(a.start).replace(":00", "")} {a.who}</div>;
              })}
              {evs.length > 3 && <div className="wc-month-more" style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); onShowDay(c); }}>+{evs.length - 3} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- New-appointment modal (controlled - persists via createOrgAppointment) ----
// A centered popup pre-filled with the day + time of the clicked slot. Start is a
// free <input type="time"> (any minute, not a fixed list), and duration + meeting
// type are quick-pick controls. The lead picker is OPTIONAL: pick a lead to attach
// the appointment, or leave it blank to book a standalone meeting. meeting_type
// drives the event colour via kindFor(), and the title keywords (showing /
// consult / listing) refine it further. Built on the prototype's .wc-modal-*
// classes (the design-system modal shell) plus inline styles for the pills/cards:
// prototype.css is unlayered and outranks every Tailwind utility inside .wcv2, so
// Tailwind colours/sizing would not apply.
type MeetingTypeKey = "phone" | "google_meet" | "in_person";
const DURATIONS: { label: string; mins: number }[] = [
  { label: "30 min", mins: 30 },
  { label: "1 hour", mins: 60 },
  { label: "1h 30m", mins: 90 },
  { label: "2 hours", mins: 120 },
];
const MEETING_TYPES: { key: MeetingTypeKey; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { key: "phone", label: "Phone Call", icon: Phone },
  { key: "google_meet", label: "Google Meet", icon: Video },
  { key: "in_person", label: "In Person", icon: MapPin },
];
const hhmm = (h: number) => String(Math.floor(h)).padStart(2, "0") + ":" + String(Math.round((h % 1) * 60)).padStart(2, "0");

const PICK_BASE: CSSProperties = { border: "1px solid", borderRadius: 10, fontSize: 12.5, fontWeight: 600, transition: ".12s" };

const leadLabel = (c: LeadOption) =>
  c.name || [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || c.phone || c.email || `Lead ${c.id}`;

function CreateModal({ day, initialHour, orgId, onClose, onSaved }: {
  day: Date; initialHour?: number; orgId: string | null; onClose: () => void; onSaved: (startsAt: Date) => void;
}) {
  const [contacts, setContacts] = useState<LeadOption[]>([]);
  const [leadQuery, setLeadQuery] = useState("");
  const [leadId, setLeadId] = useState<number | null>(null);
  const [showLeadList, setShowLeadList] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(ymd(day));
  const [time, setTime] = useState(hhmm(initialHour ?? 9));
  const [mins, setMins] = useState(60);
  const [meetingType, setMeetingType] = useState<MeetingTypeKey>("in_person");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sendSms, setSendSms] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const downOnScrimRef = useRef(false);

  // Lead picker is optional - a blank lead books a standalone meeting. An empty
  // query loads the most-recently-created leads (the endpoint orders by
  // created_at DESC); typing runs a debounced server-side search so every lead is
  // reachable, not just those with message history.
  useEffect(() => {
    if (!orgId || leadId !== null) { setContacts([]); return; }
    const q = leadQuery.trim();
    let cancelled = false;
    const t = setTimeout(() => {
      searchOrgLeads(orgId, q)
        .then((data) => {
          if (cancelled) return;
          // /leads/:orgId returns a bare array (no envelope) unless include_meta=1.
          const list = Array.isArray(data) ? data : ((data as { items?: LeadOption[] })?.items ?? []);
          setContacts(list as LeadOption[]);
        })
        .catch(() => { if (!cancelled) setContacts([]); });
    }, q ? 200 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [leadQuery, leadId, orgId]);

  // Show the 5 most-recent leads before searching; up to 8 once a query is typed.
  const matches = leadId === null ? contacts.slice(0, leadQuery.trim() ? 8 : 5) : [];

  const create = async () => {
    if (saving) return;
    if (!orgId) { setErr("No organization selected"); return; }
    const start = new Date(`${date}T${time}:00`);
    if (Number.isNaN(start.getTime())) { setErr("Pick a valid date and time"); return; }
    if (start.getTime() <= Date.now()) { setErr("Pick a time in the future"); return; }
    const end = new Date(start.getTime() + mins * 60_000);
    setSaving(true);
    setErr(null);
    try {
      await createOrgAppointment(orgId, {
        lead_id: leadId,
        appointment_type: title.trim() || "Appointment",
        meeting_type: meetingType,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        notes: notes.trim() || undefined,
        send_sms_confirmation: sendSms,
        send_email_confirmation: sendEmail,
      });
      onSaved(start);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save appointment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wc-modal-scrim"
      onMouseDown={(e) => { downOnScrimRef.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnScrimRef.current && e.target === e.currentTarget) onClose(); }}>
      <div className="wc-modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <button className="wc-modal-x" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", color: "var(--ink)" }}>New appointment</div>
          <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 3 }}>Book a meeting with a lead</div>
        </div>

        <div className="wc-modal-fieldfull" style={{ position: "relative" }}>
          <div className="wc-modal-lbl">Lead (optional)</div>
          <input className="wc-modal-input" placeholder="Search leads, or leave blank..." value={leadQuery}
            onChange={(e) => { setLeadQuery(e.target.value); setLeadId(null); setShowLeadList(true); }}
            onFocus={() => setShowLeadList(true)} />
          {showLeadList && matches.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 4, background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.12)", overflow: "hidden" }}>
              {matches.map((c) => (
                <button key={c.id} type="button"
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", fontSize: 13, color: "var(--ink-2)", borderBottom: "1px solid var(--line)" }}
                  onClick={() => { setLeadId(c.id); setLeadQuery(leadLabel(c)); setShowLeadList(false); }}>
                  {leadLabel(c)}
                </button>
              ))}
            </div>
          )}
        </div>

        {leadId !== null && (
          <div className="wc-modal-fieldfull">
            <div className="wc-modal-lbl">Send confirmation to lead</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-2)", cursor: "pointer" }}>
                <input type="checkbox" checked={sendSms} onChange={(e) => setSendSms(e.target.checked)} style={{ width: 16, height: 16, appearance: "auto", accentColor: "var(--accent)" }} />
                Send SMS confirmation
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-2)", cursor: "pointer" }}>
                <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} style={{ width: 16, height: 16, appearance: "auto", accentColor: "var(--accent)" }} />
                Send Email confirmation
              </label>
            </div>
          </div>
        )}
        <div className="wc-modal-fieldfull"><div className="wc-modal-lbl">Title</div><input className="wc-modal-input" placeholder="Buyer consult, Showing, Follow-up..." value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></div>

        <div className="wc-modal-grid">
          <div className="wc-modal-field"><div className="wc-modal-lbl">Date</div><input type="date" className="wc-modal-input" value={date} onChange={(e) => { if (e.target.value) setDate(e.target.value); }} /></div>
          <div className="wc-modal-field"><div className="wc-modal-lbl">Start</div><input type="time" className="wc-modal-input" value={time} onChange={(e) => { if (e.target.value) setTime(e.target.value); }} /></div>
        </div>

        <div className="wc-modal-fieldfull">
          <div className="wc-modal-lbl">Duration</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {DURATIONS.map((d) => {
              const on = mins === d.mins;
              return (
                <button key={d.mins} type="button" onClick={() => setMins(d.mins)}
                  style={{ ...PICK_BASE, padding: "9px 4px", borderColor: on ? "var(--accent)" : "var(--line)", background: on ? "var(--accent)" : "var(--panel)", color: on ? "#fff" : "var(--ink-2)" }}>
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="wc-modal-fieldfull">
          <div className="wc-modal-lbl">Meeting type</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {MEETING_TYPES.map(({ key, label, icon: TypeIcon }) => {
              const on = meetingType === key;
              return (
                <button key={key} type="button" onClick={() => setMeetingType(key)}
                  style={{ ...PICK_BASE, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 4px", borderColor: on ? "var(--accent)" : "var(--line)", background: on ? "var(--accent-soft)" : "var(--panel)", color: on ? "var(--accent-strong)" : "var(--ink-2)" }}>
                  <TypeIcon size={18} />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="wc-modal-fieldfull"><div className="wc-modal-lbl">Notes (optional)</div><textarea className="wc-modal-textarea" placeholder="Context for the meeting..." value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

        {err && <div style={{ fontSize: 12.5, fontWeight: 600, color: "#DC2626", marginBottom: 10 }}>{err}</div>}

        <div className="wc-modal-foot">
          <button className="wc-ghostbtn" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="wc-primary" style={{ flex: 1 }} onClick={create} disabled={saving}><Icon name="calendar" size={15} />{saving ? "Saving..." : "Book appointment"}</button>
        </div>
      </div>
    </div>
  );
}

type OpenState = RApt | { create: true; day?: Date; hour?: number } | null;

const AppointmentsCalendar = () => {
  const navigate = useNavigate();
  const orgId = localStorage.getItem("org_id");
  const now = useMemo(() => new Date(), []);

  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [selected, setSelected] = useState<Date>(now);
  const [month, setMonth] = useState<Date>(startOfMonth(now));
  const [open, setOpen] = useState<OpenState>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Open the day/week grid scrolled to the morning rather than midnight (the grid
  // now spans the full 24h, so without this it would default to the top at 12am).
  useEffect(() => {
    if (view !== "month" && scrollRef.current) scrollRef.current.scrollTop = SCROLL_TO_HOUR * ROW_H;
  }, [view]);

  const { data: apiData, refetch } = useFetch<{ items?: ApiApptRow[] }>(
    ["org_appointments"],
    () => fetchOrgAppointments(orgId),
    {},
    { refetchOnMount: "always" as const, enabled: !!orgId },
  );

  // Appointments are loaded from the API (the single source of truth) - creating
  // one persists it server-side and refetches. No mock/seed fallback: an org with
  // no appointments shows an empty calendar (empty states), not fabricated events.
  const appointments: Appt[] = useMemo(() => {
    return (apiData?.items ?? []).map(apiToAppt).filter((a): a is Appt => a !== null);
  }, [apiData]);

  const renderAppts = useMemo(() => appointments.map(toRender), [appointments]);

  const week = useMemo(() => {
    const s = startOfWeek(selected, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [selected]);

  const title = view === "month" ? `${MONTHS[month.getMonth()]} ${month.getFullYear()}`
    : view === "day" ? `${DOW_FULL[selected.getDay()]}, ${MONTHS[selected.getMonth()]} ${selected.getDate()}`
      : `${MONTHS[week[0].getMonth()]} ${week[0].getDate()} - ${week[6].getDate()}, ${week[6].getFullYear()}`;

  const agenda = apptsOn(renderAppts, selected);

  const nav = (dir: number) => {
    if (view === "month") setMonth(new Date(month.getFullYear(), month.getMonth() + dir, 1));
    else setSelected(addDays(selected, view === "day" ? dir : dir * 7));
  };
  const goToday = () => { setSelected(now); setMonth(startOfMonth(now)); };
  const pick = (d: Date) => { setSelected(d); if (d.getMonth() !== month.getMonth()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); };

  const openInbox = (leadId: number | null) => {
    if (leadId) localStorage.setItem("selectedLeadIdFromDashboard", String(leadId));
    navigate("/inbox");
  };
  const openLead = (leadId: number | null) => {
    if (leadId) localStorage.setItem("selectedLeadIdFromDashboard", String(leadId));
    navigate("/leads");
  };

  const gridHandlers: GridHandlers = { onOpen: setOpen, onSlot: (d, h) => setOpen({ create: true, day: d, hour: h }) };

  return (
    <MainLayout title="Calendar">
      <div className="wcv2 pt-4 h-[calc(100vh-4rem)] lg:h-[calc(100vh-5rem)] overflow-hidden lg:-mx-4 lg:-mt-4">
        <div className="wc-calpage">
          {/* left rail */}
          <div className="wc-calrail">
            <MiniCal selected={selected} onPick={pick} month={month} setMonth={setMonth} appts={renderAppts} today={now} />
            <div className="wc-calrail-agenda">
              <div className="wc-brief-date">{isSameDay(selected, now) ? "Today · " : ""}{DOW_FULL[selected.getDay()]}, {MONTHS[selected.getMonth()]} {selected.getDate()}</div>
              <div className="wc-calrail-h">Today's schedule</div>
              {agenda.length === 0 ? (
                <div className="wc-calrail-empty"><span className="wc-calrail-emptyic"><Icon name="calendar" size={22} /></span>No events scheduled</div>
              ) : agenda.map((a, i) => {
                const k = APPT_KINDS[a.kind];
                return (
                  <button className="wc-agenda" key={i} onClick={() => setOpen(a)}>
                    <span className="wc-agenda-bar" style={{ background: k.bar }} />
                    <div><div className="wc-agenda-t">{timeLabel(a.start)} · {a.title}</div><div className="wc-agenda-m">{[a.who, a.loc].filter(Boolean).join(" · ")}</div></div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* main */}
          <div className="wc-calmain">
            <div className="wc-calbar">
              <h1 className="wc-caltitle">{title}</h1>
              <div className="wc-calbar-mid">
                <div className="wc-viewtoggle">
                  {(["day", "week", "month"] as const).map((v) => <button key={v} className={view === v ? "is-on" : ""} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}
                </div>
              </div>
              <div className="wc-calbar-right">
                <div className="wc-calnav">
                  <button onClick={() => nav(-1)}><Icon name="chevronRight" size={16} style={{ transform: "rotate(180deg)" }} /></button>
                  <button className="wc-calnav-today" onClick={goToday}>Today</button>
                  <button onClick={() => nav(1)}><Icon name="chevronRight" size={16} /></button>
                </div>
                <button className="wc-primary" onClick={() => setOpen({ create: true })}><Icon name="plus" size={16} />New Appointment</button>
              </div>
            </div>
            <div className="wc-calscroll" ref={scrollRef}>
              {view === "week" && <WeekView week={week} appts={renderAppts} onSelectDay={(d) => { setSelected(d); setView("day"); }} today={now} {...gridHandlers} />}
              {view === "day" && <DayView day={selected} appts={renderAppts} today={now} {...gridHandlers} />}
              {view === "month" && <MonthView month={month} appts={renderAppts} onOpen={setOpen} onCreateDay={(d) => { pick(d); setOpen({ create: true, day: d }); }} onShowDay={(d) => { setSelected(d); setView("day"); }} today={now} />}
            </div>
          </div>

          {open && "create" in open && (
            <CreateModal day={open.day ?? selected} initialHour={open.hour} orgId={orgId}
              onClose={() => setOpen(null)}
              onSaved={(startsAt) => { setSelected(startsAt); void refetch(); }} />
          )}
          {open && !("create" in open) && (
            <div className="wc-modal-scrim" onClick={() => setOpen(null)}>
              <div className="wc-modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
                <button className="wc-modal-x" onClick={() => setOpen(null)}><Icon name="x" size={18} /></button>
                <div className="wc-modal-title" style={{ width: "auto" }}>{open.title}</div>
                <div className="wc-modal-crumb"><span className="wc-cbadge" style={{ color: APPT_KINDS[open.kind].fg, background: APPT_KINDS[open.kind].bg }}>{open.kind}</span></div>
                <div className="wc-evt-detail">
                  <div className="wc-irow"><span>When</span><b>{timeLabel(open.start)} - {timeLabel(open.start + open.dur)}</b></div>
                  <div className="wc-irow"><span>Lead</span><b>{open.who || "-"}</b></div>
                  <div className="wc-irow"><span>Location</span><b>{open.loc}</b></div>
                </div>
                <div className="wc-modal-foot">
                  <button className="wc-ghostbtn" onClick={() => openInbox(open.lead_id)}><Icon name="message" size={14} />Message</button>
                  <button className="wc-primary" onClick={() => openLead(open.lead_id)}><Icon name="user" size={14} />Open lead</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default AppointmentsCalendar;
