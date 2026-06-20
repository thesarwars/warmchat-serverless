import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import MainLayout from "../components/MainLayout";
import { ArrowLeft, ChevronDown, ChevronUp, Clock, Mail, MessageSquare, Pencil, Plus, Trash2, X, Zap } from "lucide-react";
import { describeStep, formatSendTime, DEFAULT_STEP_SEND_TIME } from "@/utils/workflowSchedule";
// Use the shared API helpers (cookie auth + auto-refresh on a 401). The raw
// fetch this page used before sent a bogus "Bearer cookie" header and never
// refreshed, so once the 1h access-token cookie expired mid-session every call
// 401'd and the page wrongly showed "Workflow not found" for valid workflows.
import { get, put } from "@/helpers/api";

interface FollowupStep {
  delay_days?: number;
  delay_seconds?: number;
  label?: string;
  delay_label?: string;
  subject?: string;
  message?: string;
  sendTime?: string;
  send_time?: string;
  send_at?: string;
  timezone?: string;
  channel?: string;
}

interface LogEvent {
  id: number; lead_id: number | null; lead: string; channel: string;
  status: string; label: string; at: string; error: string | null; preview: string;
}

interface AutomationDetailsPayload {
  id: number;
  header: {
    name: string;
    status: string;
    type: string;
    created_at?: string;
    timezone?: string | null;
  };
  stats: {
    sent: number;
    delivered: number;
    opened: number;
    replied: number;
    replies_total: number;
    converted: number;
  };
  rates: Record<string, number>;
  message_preview: {
    subject?: string;
    body?: string;
    opening_send_time?: string | null;
    channels?: string[];
    attachments?: Array<{ id?: number | string; name?: string; url?: string }>;
  };
  followups: FollowupStep[];
  recipients: Array<{
    id?: number | string;
    name?: string;
    email?: string;
    phone?: string;
    status?: string;
    replies?: number;
  }>;
  replies: Array<{
    id?: number | string;
    lead_id?: number | string;
    sender_name?: string;
    name?: string;
    email?: string;
    message?: string;
    body?: string;
    timestamp?: string;
    sent_at?: string;
    last_reply_at?: string;
    last_reply_preview?: string;
  }>;
}

const zoneLabel = (timezone?: string) => {
  if (timezone === "America/New_York") return "EST";
  if (timezone === "America/Los_Angeles") return "PST";
  return timezone || "";
};

/** Current short timezone abbreviation for an IANA zone (e.g. "PDT" in summer,
 * "PST" in winter). Falls back to the raw zone string. Used to label every send
 * time so there's no UTC/local ambiguity. */
const tzAbbrev = (timezone?: string | null): string => {
  const tz = (timezone || "").trim();
  if (!tz) return "";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value || tz;
  } catch {
    return tz;
  }
};

const delayLabel = (step: FollowupStep, index: number) => {
  if (step.delay_label || step.label) return step.delay_label || step.label;
  if (typeof step.delay_days === "number") return `Day ${step.delay_days}`;
  if (typeof step.delay_seconds === "number") {
    const hours = Math.round(step.delay_seconds / 3600);
    return hours >= 24 ? `After ${Math.round(hours / 24)} days` : `After ${hours} hours`;
  }
  return `Follow-up ${index + 1}`;
};

const formatTimeAmPm = (value?: string) => {
  const raw = (value || "").trim();
  if (!raw) return "";

  const meridianMatch = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (meridianMatch) {
    const hour = Number(meridianMatch[1]);
    const minute = meridianMatch[2] || "00";
    if (hour < 1 || hour > 12) return raw;
    return `${hour}:${minute.padStart(2, "0")} ${meridianMatch[3].toUpperCase()}`;
  }

  const twentyFourHourMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!twentyFourHourMatch) return raw;

  let hour = Number(twentyFourHourMatch[1]);
  const minute = twentyFourHourMatch[2];
  if (hour < 0 || hour > 23) return raw;

  const period = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${period}`;
};

const sendTimeLabel = (step: FollowupStep) => {
  const time = step.send_time || step.sendTime || step.send_at;
  const zone = zoneLabel(step.timezone);
  if (!time && !zone) return "";
  return [formatTimeAmPm(time), zone].filter(Boolean).join(" ");
};

const AutomationDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [automation, setAutomation] = useState<AutomationDetailsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem("token");

  // ── Edit mode ────────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const [editFollowups, setEditFollowups] = useState<FollowupStep[]>([]);
  // Opening-message timing: instant (default) or a wall-clock time on enroll day.
  const [editOpeningTiming, setEditOpeningTiming] = useState<"instant" | "timed">("instant");
  const [editOpeningAt, setEditOpeningAt] = useState(DEFAULT_STEP_SEND_TIME);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [logSummary, setLogSummary] = useState<{ enrolled: number; sent: number; queued?: number; sending?: number; stopped: number; failed: number; total: number; due_now?: number } | null>(null);

  const fetchDetails = async () => {
    const data = await get(`/automations/${id}/details`);
    if (data) setAutomation(data as AutomationDetailsPayload);
  };

  const fetchLogs = async () => {
    try {
      const data = await get(`/automations/${id}/logs`);
      setLogs(data?.events || []);
      setLogSummary(data?.summary || null);
    } catch { /* non-fatal */ }
  };

  useEffect(() => {
    if (!id || !token) return;
    (async () => {
      setLoading(true);
      try {
        await fetchDetails();
        await fetchLogs();
      } catch (err) {
        console.error("Error fetching automation:", err);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  // Live updates: while the page is open (and not mid-edit), refresh stats +
  // logs every 12s so the user watches SENT climb and the queue drain in real
  // time, without reloading. This is what makes a running campaign visibly
  // "alive" instead of looking frozen.
  useEffect(() => {
    if (!id || !token || editing) return;
    const interval = setInterval(() => {
      fetchDetails();
      fetchLogs();
    }, 12000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token, editing]);

  // Load the RAW editable fields (name/message/subject/followup_steps) and enter edit mode.
  const startEdit = async () => {
    try {
      const raw = await get(`/automations/${id}`);
      if (!raw) return;
      setEditName(raw.name || "");
      setEditSubject(raw.email_subject || "");
      setEditMessage(raw.message || "");
      const rawOpen = String(raw.opening_send_time || "");
      setEditOpeningTiming(/^\d{1,2}:\d{2}$/.test(rawOpen) ? "timed" : "instant");
      setEditOpeningAt(/^\d{1,2}:\d{2}$/.test(rawOpen) ? rawOpen : DEFAULT_STEP_SEND_TIME);
      setEditFollowups(
        Array.isArray(raw.followup_steps)
          ? raw.followup_steps.map((s: FollowupStep) => ({
              delay_days: typeof s.delay_days === "number" ? s.delay_days : 0,
              message: s.message || "",
              subject: s.subject || "",
              send_time: /^\d{1,2}:\d{2}$/.test(String(s.send_time || "")) ? s.send_time : DEFAULT_STEP_SEND_TIME,
              channel: String(s.channel || "").toLowerCase() === "email" ? "email" : "sms",
            }))
          : [],
      );
      setEditing(true);
    } catch (err) {
      console.error("Error loading automation for edit:", err);
    }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const result = await put(`/automations/${id}`, {
        name: editName,
        message: editMessage,
        email_subject: editSubject,
        opening_send_time: editOpeningTiming === "timed" ? editOpeningAt : null,
        followup_steps: editFollowups.map((s) => ({
          delay_days: Number(s.delay_days) || 0,
          message: s.message || "",
          ...(s.subject ? { subject: s.subject } : {}),
          send_time: /^\d{1,2}:\d{2}$/.test(String(s.send_time || "")) ? s.send_time : DEFAULT_STEP_SEND_TIME,
          ...(s.timezone ? { timezone: s.timezone } : {}),
          channel: String(s.channel || "").toLowerCase() === "email" ? "email" : "sms",
        })),
      });
      if (result?.success) {
        setEditing(false);
        await fetchDetails();
      }
    } catch (err) {
      console.error("Error saving automation:", err);
    } finally {
      setSaving(false);
    }
  };

  const updateFollowup = (index: number, patch: Partial<FollowupStep>) =>
    setEditFollowups((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  const addFollowup = () =>
    setEditFollowups((prev) => [...prev, { delay_days: (prev[prev.length - 1]?.delay_days ?? 0) + 2, message: "", send_time: DEFAULT_STEP_SEND_TIME, channel: "sms" }]);
  const removeFollowup = (index: number) =>
    setEditFollowups((prev) => prev.filter((_, i) => i !== index));
  const moveFollowup = (index: number, dir: -1 | 1) =>
    setEditFollowups((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });

  const channels = useMemo(() => automation?.message_preview?.channels || [], [automation]);
  const isEmail = channels.some((channel) => String(channel).toLowerCase() === "email");

  if (loading) {
    return (
      <MainLayout>
        <div className="mx-auto max-w-6xl animate-pulse p-6">
          <div className="mb-5 h-4 w-36 rounded bg-gray-100" />
          <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-xs">
            <div className="h-3 w-24 rounded bg-orange-100" />
            <div className="mt-2 h-7 w-2/3 rounded bg-gray-100" />
            <div className="mt-2 h-3 w-40 rounded bg-gray-100" />
          </div>
          <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 shadow-xs">
                <div className="h-3 w-14 rounded bg-gray-100" />
                <div className="mt-2 h-5 w-10 rounded bg-gray-100" />
              </div>
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-xs">
                <div className="mb-4 h-5 w-32 rounded bg-gray-100" />
                <div className="h-24 rounded-lg bg-gray-50" />
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-xs">
                <div className="mb-4 h-5 w-40 rounded bg-gray-100" />
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-lg bg-gray-50" />)}
                </div>
              </div>
            </div>
            <div className="space-y-5">
              <div className="h-48 rounded-2xl border border-gray-100 bg-white shadow-xs" />
              <div className="h-40 rounded-2xl border border-gray-100 bg-white shadow-xs" />
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }
  if (!automation) return <MainLayout><p className="p-8 text-red-500">Workflow not found.</p></MainLayout>;

  // Follow-up dates are anchored to when the workflow was created (its schedule
  // from that point forward), not the moment the page is viewed.
  const createdBase = automation.header.created_at ? new Date(automation.header.created_at) : undefined;
  // Send times are stored in the workspace timezone; label every time with its
  // current abbreviation (e.g. "PDT") so it's never mistaken for UTC.
  const tzShort = tzAbbrev(automation.header.timezone);

  return (
    <MainLayout>
      <div className="mx-auto max-w-6xl p-6">
        <button onClick={() => navigate("/ai/agent?tab=outbound")} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-orange-600">
          <ArrowLeft size={16} /> Back to workflows
        </button>

        <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-xs">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-orange-500">{automation.header.type}</div>
              {editing ? (
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Workflow name"
                  className="mt-1 w-full rounded-lg border border-orange-200 px-3 py-2 text-2xl font-bold text-gray-950 outline-none focus:border-orange-400"
                />
              ) : (
                <h1 className="mt-1 text-2xl font-bold text-gray-950">{automation.header.name}</h1>
              )}
              <p className="mt-1 text-sm text-gray-500">
                Created {automation.header.created_at ? new Date(automation.header.created_at).toLocaleString() : "unknown"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-700">
                {automation.header.status}
              </span>
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <X size={14} /> Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={startEdit}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 px-3 py-2 text-sm font-semibold text-orange-600 hover:bg-orange-50"
                >
                  <Pencil size={14} /> Edit
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Sent", automation.stats.sent],
            ["Delivered", automation.stats.delivered],
            ["Opened", automation.stats.opened],
            ["Replied", automation.stats.replied],
            ["Total Replies", automation.stats.replies_total],
            ["Converted", automation.stats.converted],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-gray-100 bg-white p-4 shadow-xs">
              <div className="text-xs font-semibold uppercase text-gray-500">{label}</div>
              <div className="mt-1 text-xl font-bold text-gray-950">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-xs">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {isEmail ? <Mail size={18} className="text-orange-500" /> : <MessageSquare size={18} className="text-orange-500" />}
                <h2 className="text-lg font-bold text-gray-950">Main Message</h2>
                {(() => {
                  const ot = (automation.message_preview.opening_send_time || "").trim() || null;
                  const sc = describeStep(0, ot, { instant: !ot });
                  return (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-600">
                      <Zap size={11} /> {ot ? `Day 0 · ${sc.timeLabel}${tzShort ? ` ${tzShort}` : ""}` : `Instant · sends right away (~${sc.timeLabel})`}
                    </span>
                  );
                })()}
              </div>
              {isEmail ? (
                <div className="mb-4 rounded-lg border border-orange-100 bg-orange-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-orange-600">Email Subject</div>
                  {editing ? (
                    <input
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      placeholder="Email subject"
                      className="mt-1 w-full rounded-md border border-orange-200 bg-white px-3 py-2 text-sm font-semibold text-gray-950 outline-none focus:border-orange-400"
                    />
                  ) : (
                    <div className="mt-1 whitespace-pre-wrap text-sm font-semibold text-gray-950">
                      {automation.message_preview.subject || "(No subject)"}
                    </div>
                  )}
                </div>
              ) : null}
              {editing ? (
                <>
                  <textarea
                    value={editMessage}
                    onChange={(e) => setEditMessage(e.target.value)}
                    rows={5}
                    placeholder="Write the opening message..."
                    className="w-full rounded-lg border border-orange-200 bg-white p-4 text-sm leading-6 text-gray-800 outline-none focus:border-orange-400"
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-gray-700">When to send:</span>
                    <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-sm">
                      <button type="button" onClick={() => setEditOpeningTiming("instant")} className={`px-3 py-1.5 font-semibold ${editOpeningTiming === "instant" ? "bg-orange-500 text-white" : "bg-white text-gray-600"}`}>Send now</button>
                      <button type="button" onClick={() => setEditOpeningTiming("timed")} className={`px-3 py-1.5 font-semibold ${editOpeningTiming === "timed" ? "bg-orange-500 text-white" : "bg-white text-gray-600"}`}>At a specific time</button>
                    </div>
                    {editOpeningTiming === "timed" && (
                      <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                        at
                        <input type="time" value={editOpeningAt} onChange={(e) => setEditOpeningAt(e.target.value)} className="rounded border border-gray-200 px-2 py-1 text-sm" />
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400"><Clock size={11} /> account time</span>
                      </label>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">
                    {editOpeningTiming === "instant"
                      ? "The opening sends the moment a lead is enrolled."
                      : `The opening sends on the enrollment day at ${describeStep(0, editOpeningAt, { instant: false }).timeLabel}.`}
                  </p>
                </>
              ) : (
                <div className="whitespace-pre-wrap rounded-lg border border-gray-100 bg-white p-4 text-sm leading-6 text-gray-800">
                  {automation.message_preview.body || "No message body."}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-xs">
              <h2 className="mb-4 text-lg font-bold text-gray-950">Follow-Up Sequence</h2>
              {editing ? (
                <div className="space-y-3">
                  {editFollowups.map((step, index) => (
                    <div key={index} className="rounded-lg border border-gray-200 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 text-sm text-gray-600">
                          <span className="font-semibold text-gray-800">Step {index + 1}</span>
                          <span className="text-gray-300">·</span> send after
                          <input
                            type="number"
                            min={0}
                            value={step.delay_days ?? 0}
                            onChange={(e) => updateFollowup(index, { delay_days: Number(e.target.value) })}
                            className="w-16 rounded border border-gray-200 px-2 py-1 text-sm"
                          />
                          days at
                          <input
                            type="time"
                            value={step.send_time || DEFAULT_STEP_SEND_TIME}
                            onChange={(e) => updateFollowup(index, { send_time: e.target.value })}
                            className="rounded border border-gray-200 px-2 py-1 text-sm"
                          />
                          <span className="inline-flex items-center gap-1 text-gray-400"><Clock size={11} /></span>
                          <select
                            value={step.timezone || ""}
                            onChange={(e) => updateFollowup(index, { timezone: e.target.value })}
                            className="rounded border border-gray-200 px-2 py-1 text-sm"
                            title="Time zone for this step's send time"
                          >
                            <option value="">Account time</option>
                            <option value="America/Los_Angeles">Pacific (PT)</option>
                            <option value="America/Denver">Mountain (MT)</option>
                            <option value="America/Chicago">Central (CT)</option>
                            <option value="America/New_York">Eastern (ET)</option>
                          </select>
                          <span className="text-gray-300">·</span>
                          <select
                            value={step.channel || "sms"}
                            onChange={(e) => updateFollowup(index, { channel: e.target.value })}
                            className="rounded border border-gray-200 px-2 py-1 text-sm font-semibold"
                            title="Channel for this step"
                          >
                            <option value="sms">SMS</option>
                            <option value="email">Email</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => moveFollowup(index, -1)} disabled={index === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move step up"><ChevronUp size={16} /></button>
                          <button type="button" onClick={() => moveFollowup(index, 1)} disabled={index === editFollowups.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move step down"><ChevronDown size={16} /></button>
                          <button type="button" onClick={() => removeFollowup(index)} className="text-gray-400 hover:text-red-500" aria-label="Remove step"><Trash2 size={15} /></button>
                        </div>
                      </div>
                      <div className="mb-2 inline-flex items-center gap-1.5 text-xs text-gray-500">
                        <Zap size={11} className="text-orange-400" />
                        If started today, lands {describeStep(Number(step.delay_days) || 1, step.send_time).dateLabel} at {describeStep(Number(step.delay_days) || 1, step.send_time).timeLabel}
                      </div>
                      {(step.channel || "sms") === "email" && (
                        <input
                          value={step.subject || ""}
                          onChange={(e) => updateFollowup(index, { subject: e.target.value })}
                          placeholder="Email subject..."
                          className="mb-2 w-full rounded-md border border-gray-200 p-2 text-sm text-gray-800 outline-none focus:border-orange-400"
                        />
                      )}
                      <textarea
                        value={step.message || ""}
                        onChange={(e) => updateFollowup(index, { message: e.target.value })}
                        rows={3}
                        placeholder="Follow-up message..."
                        className="w-full rounded-md border border-gray-200 p-2 text-sm leading-6 text-gray-800 outline-none focus:border-orange-400"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addFollowup}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-orange-300 px-3 py-2 text-sm font-semibold text-orange-600 hover:bg-orange-50"
                  >
                    <Plus size={14} /> Add step
                  </button>
                </div>
              ) : automation.followups?.length ? (
                <div className="space-y-4">
                  {automation.followups.map((step, index) => (
                    <div key={`${index}-${step.delay_days}-${step.delay_seconds}`} className="grid gap-0 md:grid-cols-[48px_150px_minmax(0,1fr)]">
                      <div className="relative hidden justify-center md:flex">
                        <div className="z-10 flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white">
                          {index + 1}
                        </div>
                        {index < automation.followups.length - 1 ? (
                          <div className="absolute top-8 h-[calc(100%+16px)] border-l border-dashed border-orange-200" />
                        ) : null}
                      </div>
                      <div className="rounded-l-lg border border-gray-200 bg-gray-50 p-4 md:border-r-0">
                        <div className="font-bold text-gray-950">{delayLabel(step, index)}</div>
                        <div className="mt-1 text-xs font-medium text-gray-400">
                          {describeStep(Number(step.delay_days) || 1, step.send_time || step.sendTime, { base: createdBase }).dateLabel}
                        </div>
                        <div className="mt-2 text-sm font-medium text-gray-500">
                          {sendTimeLabel(step) || formatSendTime(DEFAULT_STEP_SEND_TIME)}
                          {/* Step has no own zone -> label with the workspace tz. */}
                          {!step.timezone && tzShort ? ` ${tzShort}` : ""}
                        </div>
                      </div>
                      <div className="rounded-r-lg border border-gray-200 bg-white p-4">
                        {isEmail ? (
                          <div className="mb-3 rounded-lg border border-orange-100 bg-orange-50 px-3 py-2">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-orange-600">Email Subject</div>
                            <div className="mt-1 whitespace-pre-wrap text-sm font-semibold text-gray-950">
                              {step.subject || "(No subject)"}
                            </div>
                          </div>
                        ) : null}
                        <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{step.message || "No message."}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">No follow-up sequence attached.</p>
              )}
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-xs">
              <h2 className="mb-3 text-lg font-bold text-gray-950">Recipients</h2>
              <div className="max-h-90 space-y-2 overflow-auto">
                {automation.recipients?.map((recipient) => (
                  <div key={recipient.id || recipient.email} className="rounded-lg border border-gray-100 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900">{recipient.name || recipient.email}</div>
                        <div className="truncate text-gray-500">{recipient.email}</div>
                        <div className="mt-1 text-xs text-gray-500">Replies: {recipient.replies || 0}</div>
                      </div>
                      {recipient.id ? (
                        <button
                          onClick={() => navigate(`/inbox?lead=${recipient.id}&channel=unified`)}
                          className="shrink-0 rounded-md border border-orange-200 px-2.5 py-1.5 text-xs font-semibold text-orange-600 hover:bg-orange-50"
                        >
                          Open Inbox
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-xs">
              <h2 className="mb-3 text-lg font-bold text-gray-950">Replies</h2>
              {automation.replies?.length ? (
                <div className="space-y-3">
                  {automation.replies.map((reply) => (
                    <div key={`${reply.lead_id}-${reply.last_reply_at}`} className="rounded-lg border border-gray-100 p-3 text-sm">
                      <div className="font-semibold text-gray-900">{reply.name || reply.email}</div>
                      <div className="mt-1 text-gray-600">{reply.last_reply_preview}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No replies yet.</p>
              )}
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-xs">
              <div className="mb-1 flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-950">Logs</h2>
                {/* Live status: a green pulsing dot whenever there's still a queue
                    to drain, so the user can SEE the campaign is actively working. */}
                {logSummary && ((logSummary.queued ?? 0) > 0 || (logSummary.sending ?? 0) > 0) ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                    Sending now
                  </span>
                ) : logSummary && logSummary.total > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">Idle</span>
                ) : null}
              </div>
              {logSummary ? (
                <div className="mb-3 text-xs text-gray-500">
                  {logSummary.sent} sent
                  {(logSummary.queued ?? 0) > 0 ? ` · ${logSummary.queued} queued` : ""}
                  {logSummary.stopped ? ` · ${logSummary.stopped} stopped` : ""}
                  {logSummary.failed ? ` · ${logSummary.failed} failed` : ""}
                  {" · "}{logSummary.enrolled} leads
                  <span className="ml-1 text-gray-400">(updates live)</span>
                </div>
              ) : null}
              {logs.length ? (
                <div className="max-h-90 space-y-2 overflow-auto">
                  {logs.map((e) => (
                    <div key={e.id} className="rounded-lg border border-gray-100 p-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-900">{e.label}</span>
                        <span className="shrink-0 text-xs text-gray-400">
                          {new Date(e.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        {e.lead} · {e.channel.toUpperCase()}{e.error ? ` · ${e.error}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No activity yet.</p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </MainLayout>
  );
};

export default AutomationDetails;
