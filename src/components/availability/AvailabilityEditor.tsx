import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchAvailability, updateAvailability } from "../../helpers/backend";
import { Icon } from "../ai-v2/Icon";
import { TimezonePicker } from "../TimezonePicker";
import "../ai-v2/prototype.css";

/* The agent's bookable hours - one source of truth (agent_availability), reused
   from Settings v2 and AI Inbound settings. The AI honors these when
   proposing/booking appointments. wcv2-styled. */

type Window = [string, string];
interface Config {
  timezone: string;
  weeklyHours: Record<string, Window[]>;
  exceptions: string[];
  slotMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  horizonDays: number;
  enabled: boolean;
}

const DAYS: [string, string][] = [
  ["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"],
  ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"],
];

const DEFAULT_CONFIG: Config = {
  timezone: "America/New_York",
  weeklyHours: { mon: [["08:00", "20:00"]], tue: [["08:00", "20:00"]], wed: [["08:00", "20:00"]], thu: [["08:00", "20:00"]], fri: [["08:00", "20:00"]], sat: [["08:00", "20:00"]], sun: [["08:00", "20:00"]] },
  exceptions: [],
  slotMinutes: 30,
  bufferMinutes: 0,
  minNoticeHours: 2,
  horizonDays: 14,
  enabled: true,
};

function NumField({ label, value, onChange, min, max, suffix }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; suffix: string }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="wc-band-d">{label}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <input className="wc-modal-input" style={{ width: 90 }} type="number" min={min} max={max} value={value}
          onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))} />
        <span className="wc-band-d">{suffix}</span>
      </span>
    </label>
  );
}

export function AvailabilityEditor({ heading = "Booking availability" }: { heading?: string }) {
  const qc = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["availability"],
    queryFn: () => fetchAvailability() as Promise<Config>,
  });
  const [cfg, setCfg] = useState<Config>(DEFAULT_CONFIG);
  useEffect(() => { if (data) setCfg({ ...DEFAULT_CONFIG, ...data, weeklyHours: data.weeklyHours || DEFAULT_CONFIG.weeklyHours }); }, [data]);

  // The booking master switch IS the inbound "Booking intent" workflow card
  // (w5) - refresh the workflow cards so the toggle there reflects any change.
  const invalidateBooking = () => {
    qc.invalidateQueries({ queryKey: ["availability"] });
    qc.invalidateQueries({ queryKey: ["ai-workflows", "inbound"] });
  };

  const save = useMutation({
    mutationFn: () => updateAvailability({
      timezone: cfg.timezone,
      weekly_hours: cfg.weeklyHours,
      exceptions: cfg.exceptions,
      slot_minutes: cfg.slotMinutes,
      buffer_minutes: cfg.bufferMinutes,
      min_notice_hours: cfg.minNoticeHours,
      horizon_days: cfg.horizonDays,
      enabled: cfg.enabled,
    }),
    onSuccess: () => { invalidateBooking(); toast.success("Availability saved"); },
  });

  // The master switch persists on its own (no Save click needed) so it behaves
  // like a real on/off control and stays in lockstep with the w5 workflow card.
  const toggleEnabled = useMutation({
    mutationFn: (next: boolean) => updateAvailability({ enabled: next }),
    onSuccess: (_r, next) => { invalidateBooking(); toast.success(next ? "AI booking on" : "AI booking off"); },
  });
  const setEnabled = (next: boolean) => { setCfg((c) => ({ ...c, enabled: next })); toggleEnabled.mutate(next); };

  const setDayWindows = (day: string, windows: Window[]) =>
    setCfg((c) => ({ ...c, weeklyHours: { ...c.weeklyHours, [day]: windows } }));
  const addWindow = (day: string) => setDayWindows(day, [...(cfg.weeklyHours[day] || []), ["09:00", "17:00"]]);
  const removeWindow = (day: string, i: number) => setDayWindows(day, (cfg.weeklyHours[day] || []).filter((_, idx) => idx !== i));
  const editWindow = (day: string, i: number, which: 0 | 1, val: string) =>
    setDayWindows(day, (cfg.weeklyHours[day] || []).map((w, idx) => (idx === i ? (which === 0 ? [val, w[1]] : [w[0], val]) : w)));

  if (isPending) return <div className="wc-band-d" style={{ padding: 16 }}>Loading availability...</div>;

  return (
    <div className="wcv2" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="wc-primary" disabled={save.isPending} onClick={() => save.mutate()}>
          <Icon name="check" size={15} />{save.isPending ? "Saving..." : "Save availability"}
        </button>
      </div>

      <div className="wc-panel-card pad">
        <div className="wc-card-head tight">
          <div className="wc-card-h2">{heading}</div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 12 }}>
          <button className={"wc-toggle" + (cfg.enabled ? " is-on" : "")} style={{ marginTop: 2, flexShrink: 0, ...(toggleEnabled.isPending ? { opacity: 0.6 } : {}) }} disabled={toggleEnabled.isPending} title="Enable AI booking" onClick={() => setEnabled(!cfg.enabled)}><span className="wc-toggle-knob" /></button>
          <div className="wc-band-d">
            The AI only proposes and books times inside these hours - it never double-books or books outside them.
            {" "}When this is off, the AI stops offering times and cannot book any appointments, your existing appointments stay as they are.
          </div>
        </div>

        <div className="wc-pfield" style={{ marginTop: 14, maxWidth: 320 }}>
          <label>Timezone</label>
          <TimezonePicker value={cfg.timezone} onChange={(tz) => setCfg((c) => ({ ...c, timezone: tz }))} inputClassName="wc-modal-input" />
        </div>

        <div className="wc-card-h2 sm" style={{ margin: "18px 0 10px" }}>Weekly hours</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {DAYS.map(([key, label]) => {
            const windows = cfg.weeklyHours[key] || [];
            const on = windows.length > 0;
            return (
              <div key={key} style={{ display: "flex", alignItems: "flex-start", gap: 14, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
                <button className={"wc-toggle" + (on ? " is-on" : "")} style={{ marginTop: 2 }}
                  onClick={() => (on ? setDayWindows(key, []) : setDayWindows(key, [["09:00", "17:00"]]))}><span className="wc-toggle-knob" /></button>
                <div style={{ width: 96, fontWeight: 600, paddingTop: 4 }}>{label}</div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                  {!on && <span className="wc-band-d" style={{ paddingTop: 4 }}>Unavailable</span>}
                  {windows.map((w, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input className="wc-modal-input" style={{ width: 130 }} type="time" value={w[0]} onChange={(e) => editWindow(key, i, 0, e.target.value)} />
                      <span className="wc-band-d">to</span>
                      <input className="wc-modal-input" style={{ width: 130 }} type="time" value={w[1]} onChange={(e) => editWindow(key, i, 1, e.target.value)} />
                      <button className="wc-iconbtn-sm wc-danger" title="Remove" onClick={() => removeWindow(key, i)}><Icon name="trash" size={14} /></button>
                    </div>
                  ))}
                  {on && <button className="wc-ghostbtn wc-sm" style={{ alignSelf: "flex-start" }} onClick={() => addWindow(key)}><Icon name="plus" size={13} />Add window</button>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="wc-panel-card pad">
        <div className="wc-card-h2 sm" style={{ marginBottom: 12 }}>Booking rules</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 22 }}>
          <NumField label="Appointment length" value={cfg.slotMinutes} onChange={(n) => setCfg((c) => ({ ...c, slotMinutes: n }))} min={5} max={240} suffix="min" />
          <NumField label="Buffer between" value={cfg.bufferMinutes} onChange={(n) => setCfg((c) => ({ ...c, bufferMinutes: n }))} min={0} max={120} suffix="min" />
          <NumField label="Minimum notice" value={cfg.minNoticeHours} onChange={(n) => setCfg((c) => ({ ...c, minNoticeHours: n }))} min={0} max={168} suffix="hrs" />
          <NumField label="Book up to" value={cfg.horizonDays} onChange={(n) => setCfg((c) => ({ ...c, horizonDays: n }))} min={1} max={90} suffix="days ahead" />
        </div>
      </div>
    </div>
  );
}
