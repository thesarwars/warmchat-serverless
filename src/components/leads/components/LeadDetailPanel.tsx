import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Pencil,
  Phone,
  MessageSquare,
  Calendar,
  ArrowUpRight,
  Mail,
  Bell,
  Check,
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight as CallOut,
} from "lucide-react";
import { STAGE_OPTIONS, STAGE_SCORE, PRICE_RANGE_OPTIONS } from "../constants";
import type { EditingLead } from "../types";
import {
  activityFor,
  getAiStatus,
  getAreaValue,
  getPriceRange,
  getStageValue,
  leadInitials,
  scoreFillColor,
  stageDotColor,
  stagePillClass,
} from "../utils/leadDisplay";

/** A single call-history row as returned by /api/calling/leads/:id/calls. */
type CallSummary = {
  id: string;
  direction: string;
  status: string;
  duration: number;
  initiatedAt: string;
  completedAt: string | null;
};

interface Props {
  lead: EditingLead | null;
  apiBase: string;
  token: string | null;
  onClose: () => void;
  /** Persist a single field (optimistic) - the Leads page's updateLeadField. */
  onUpdateField: (leadId: number, field: string, value: unknown) => void | Promise<void>;
  /** Open the lead in the inbox composer (Message action). */
  onMessage: (leadId: number) => void;
  /** Open the full Add/Edit modal for this lead (pencil / "Edit details"). */
  onEdit: (lead: EditingLead) => void;
  /** Open the AI assistant chat for this lead. */
  onOpenAi: (lead: EditingLead) => void;
}

function fmtDuration(seconds: number) {
  if (!seconds) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

function fmtCallTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Slide-in lead detail drawer (spec section 8). Renders identity, AI score card,
 * action buttons (Call / Message / Book / Move Stage), editable contact rows,
 * qualification fields + notes, scheduled-messages empty state, per-contact
 * notifications, real call history, and the AI activity timeline. Every editable
 * control persists through the page's real updateLeadField handler.
 */
export default function LeadDetailPanel({
  lead,
  apiBase,
  token,
  onClose,
  onUpdateField,
  onMessage,
  onEdit,
  onOpenAi,
}: Props) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingContact, setEditingContact] = useState<"phone" | "email" | null>(null);
  const [contactDraft, setContactDraft] = useState("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldDraft, setFieldDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const moveRef = useRef<HTMLDivElement>(null);

  const leadId = lead?.id ?? null;

  // Reset transient editor state + notes draft when the active lead changes.
  useEffect(() => {
    setMoveOpen(false);
    setEditingName(false);
    setEditingContact(null);
    setEditingField(null);
    setNotesDraft(String(lead?.notes ?? ""));
  }, [leadId, lead?.notes]);

  // Close the Move-Stage menu on outside click.
  useEffect(() => {
    if (!moveOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moveRef.current && !moveRef.current.contains(e.target as Node)) setMoveOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moveOpen]);

  // Load real call history for the selected lead.
  useEffect(() => {
    setCalls([]);
    if (!leadId || !token) return;
    let cancelled = false;
    fetch(`${apiBase}/calling/leads/${leadId}/calls?limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        const list = Array.isArray(d?.calls) ? d.calls : [];
        setCalls(list as CallSummary[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leadId, apiBase, token]);

  const stage = useMemo(() => (lead ? getStageValue(lead) : "New Lead"), [lead]);
  const score = STAGE_SCORE[stage] ?? 0;
  const prob = score;
  const timeline = useMemo(() => (lead ? activityFor(lead) : []), [lead]);

  if (!lead) return null;

  const save = (field: string, value: unknown) => {
    if (leadId != null) void onUpdateField(leadId, field, value);
  };

  const aiStatus = getAiStatus(lead) || "AI Off";
  const area = getAreaValue(lead);
  const budget = getPriceRange(lead);
  const emailNotif = lead.email_notifications_enabled !== false;
  const smsNotif = lead.sms_notifications_enabled !== false;
  const preApproved = lead.pre_approved;

  return (
    <>
      <div className="wc-scrim" onClick={onClose} />
      <aside className="wc-panel" role="dialog" aria-label="Lead detail">
        {/* 1. Head - close + current stage pill */}
        <div className="wc-panel-head">
          <button type="button" className="wc-iconbtn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
          <span className={`wc-stage-pill ${stagePillClass(stage)}`}>
            <span className="wc-statusdot" style={{ background: stageDotColor(stage) }} />
            {stage} · {prob}%
          </span>
        </div>

        {/* 2. Identity - avatar + editable name + AI status + source */}
        <div className="wc-panel-id">
          <span className="wc-avatar wc-avatar-grey" style={{ width: 56, height: 56, fontSize: 18 }}>
            {leadInitials(lead.name)}
          </span>
          <div className="min-w-0">
            {editingName ? (
              <input
                autoFocus
                className="wc-panel-name-input"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  setEditingName(false);
                  if (nameDraft.trim() && nameDraft.trim() !== (lead.name ?? "")) save("name", nameDraft.trim());
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingName(false);
                }}
              />
            ) : (
              <button
                type="button"
                className="wc-panel-name wc-editable"
                onClick={() => {
                  setNameDraft(lead.name ?? "");
                  setEditingName(true);
                }}
              >
                <span className="truncate">{lead.name || "Unnamed lead"}</span>
                <Pencil size={14} className="wc-field-pen" />
              </button>
            )}
            <div className="wc-panel-sub">
              <span className="wc-ai-pill" style={{ color: scoreFillColor(score) }}>
                <span className="wc-ai-dot" style={{ background: scoreFillColor(score) }} />
                {aiStatus}
              </span>
              {lead.source?.trim() ? (
                <span className="wc-muted" style={{ fontSize: 12 }}>
                  {lead.source}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* 3. AI Lead Score card */}
        <div className="wc-score-card">
          <div className="wc-score-card-l">
            <Sparkles size={15} />
            AI Lead Score
          </div>
          <div className="wc-score-card-r">
            <div className="wc-score-big" style={{ color: scoreFillColor(score) }}>
              {score}
              <span> / 100</span>
            </div>
            <span className="wc-score-track wide">
              <span className="wc-score-fill" style={{ width: `${score}%`, background: scoreFillColor(score) }} />
            </span>
          </div>
        </div>

        {/* 4. Actions - Call / Message / Book / Move Stage */}
        <div className="wc-actions">
          <button type="button" className="wc-act" onClick={() => onMessage(lead.id)}>
            <Phone size={16} />
            Call
          </button>
          <button type="button" className="wc-act is-primary" onClick={() => onMessage(lead.id)}>
            <MessageSquare size={16} />
            Message
          </button>
          <button type="button" className="wc-act" onClick={() => onMessage(lead.id)}>
            <Calendar size={16} />
            Book
          </button>
          <div className="wc-move-wrap" ref={moveRef}>
            <button type="button" className="wc-act" style={{ width: "100%" }} onClick={() => setMoveOpen((v) => !v)}>
              <ArrowUpRight size={16} />
              Move Stage
            </button>
            {moveOpen ? (
              <div className="wc-move-menu">
                {STAGE_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`wc-move-item${s === stage ? " is-current" : ""}`}
                    onClick={() => {
                      setMoveOpen(false);
                      if (s !== stage) save("status", s);
                    }}
                  >
                    <span className="wc-statusdot" style={{ background: stageDotColor(s) }} />
                    {s}
                    {s === stage ? <Check size={15} /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* 5. Contact - editable phone + email rows */}
        <div className="wc-panel-section">
          <div className="wc-panel-h">
            <Phone size={13} /> Contact
          </div>
          <div className="wc-contact">
            {(["phone", "email"] as const).map((kind) => {
              const Icon = kind === "phone" ? Phone : Mail;
              const value = String(lead[kind] ?? "");
              const isEditing = editingContact === kind;
              return (
                <div
                  key={kind}
                  className="wc-contact-row wc-editable"
                  onClick={() => {
                    if (isEditing) return;
                    setContactDraft(value);
                    setEditingContact(kind);
                  }}
                >
                  <Icon size={15} />
                  {isEditing ? (
                    <input
                      autoFocus
                      className="wc-contact-input"
                      value={contactDraft}
                      onChange={(e) => setContactDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => {
                        setEditingContact(null);
                        if (contactDraft.trim() !== value) save(kind, contactDraft.trim());
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setEditingContact(null);
                      }}
                    />
                  ) : (
                    <span className="wc-contact-val truncate">{value || (kind === "phone" ? "Add phone" : "Add email")}</span>
                  )}
                  <Pencil size={13} className="wc-field-pen" />
                </div>
              );
            })}
          </div>
        </div>

        {/* 6. Qualification fields + notes */}
        <div className="wc-panel-section">
          <div className="wc-panel-h">Qualification</div>
          <div className="wc-fields">
            <EditableField
              label="Budget"
              value={budget === "-" ? "" : budget}
              field="price_range"
              suggestions={PRICE_RANGE_OPTIONS as readonly string[]}
              editingField={editingField}
              setEditingField={setEditingField}
              fieldDraft={fieldDraft}
              setFieldDraft={setFieldDraft}
              onSave={save}
            />
            <EditableField
              label="Area"
              value={area}
              field="area"
              editingField={editingField}
              setEditingField={setEditingField}
              fieldDraft={fieldDraft}
              setFieldDraft={setFieldDraft}
              onSave={save}
            />
            <EditableField
              label="Timeline"
              value={String(lead.timeline ?? "")}
              field="timeline"
              editingField={editingField}
              setEditingField={setEditingField}
              fieldDraft={fieldDraft}
              setFieldDraft={setFieldDraft}
              onSave={save}
            />
            <button
              type="button"
              className="wc-field wc-field-btn"
              onClick={() => save("pre_approved", !(preApproved === true))}
            >
              <div className="wc-field-l">Pre-Approved</div>
              <div className={`wc-field-v${preApproved === true ? " is-ok" : ""}`}>
                {preApproved === true ? <Check size={15} /> : null}
                {preApproved === true ? "Yes" : preApproved === false ? "No" : "—"}
              </div>
            </button>
          </div>

          <div className="wc-notes">
            <textarea
              className="wc-notes-ta"
              placeholder="Add notes about this lead…"
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => {
                if (notesDraft !== String(lead.notes ?? "")) save("notes", notesDraft);
              }}
            />
          </div>

          <button
            type="button"
            className="wc-linkbtn"
            style={{ marginTop: 10, color: "var(--accent-strong)", fontSize: 13, fontWeight: 600 }}
            onClick={() => onEdit(lead)}
          >
            Edit all details →
          </button>
        </div>

        {/* 7. Scheduled messages - empty state */}
        <div className="wc-panel-section">
          <div className="wc-panel-h">
            <Calendar size={13} /> Scheduled Messages
          </div>
          <p className="wc-cc-empty">
            No scheduled messages. Start AI follow-up or enroll this lead in a campaign to queue automated touches.
          </p>
        </div>

        {/* 8. Per-Contact Notifications */}
        <div className="wc-panel-section">
          <div className="wc-panel-h">
            <Bell size={13} /> Notifications
          </div>
          <p className="wc-cc-note">
            Control which channels notify you about activity on this lead.
          </p>
          <div className="wc-cc-notif">
            <button
              type="button"
              className="wc-cc-notifrow"
              onClick={() => save("email_notifications_enabled", !emailNotif)}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Bell size={18} className="wc-cc-bell-blue" />
                <span>
                  <span className="wc-cc-notif-t">Email</span>
                  <span className="wc-cc-notif-s">{emailNotif ? "On — you'll get email alerts" : "Off"}</span>
                </span>
              </span>
              <Toggle on={emailNotif} />
            </button>
            <button
              type="button"
              className="wc-cc-notifrow"
              onClick={() => save("sms_notifications_enabled", !smsNotif)}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Bell size={18} className="wc-cc-bell-green" />
                <span>
                  <span className="wc-cc-notif-t">SMS</span>
                  <span className="wc-cc-notif-s">{smsNotif ? "On — you'll get text alerts" : "Off"}</span>
                </span>
              </span>
              <Toggle on={smsNotif} />
            </button>
          </div>
        </div>

        {/* 9. Call history */}
        <div className="wc-panel-section">
          <div className="wc-panel-h">
            <Phone size={13} /> Call History
          </div>
          {calls.length === 0 ? (
            <p className="wc-cc-empty">No calls logged yet.</p>
          ) : (
            <div className="wc-cc-calls">
              {calls.map((c) => {
                const inbound = String(c.direction).toUpperCase() === "INBOUND";
                return (
                  <div key={c.id} className="wc-cc-call">
                    <span className="wc-cc-call-ic">
                      {inbound ? <ArrowDownLeft size={15} /> : <CallOut size={15} />}
                    </span>
                    <div className="wc-cc-call-b">
                      <div className="wc-cc-call-t">
                        {inbound ? "Inbound" : "Outbound"} <span className="wc-cc-call-st">· {c.status}</span>
                      </div>
                      <div className="wc-cc-call-s">
                        {fmtCallTime(c.initiatedAt)} · {fmtDuration(c.duration)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 10. AI Activity timeline */}
        <div className="wc-panel-section">
          <div className="wc-panel-h">
            <Sparkles size={13} /> AI Activity
          </div>
          {timeline.length === 0 ? (
            <p className="wc-cc-empty">No AI activity yet.</p>
          ) : (
            <div className="wc-timeline">
              {timeline.map((t, i) => (
                <div key={i} className="wc-tl-item">
                  <span className="wc-tl-check">
                    <Check size={12} />
                  </span>
                  <span className="wc-tl-text">{t}</span>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="wc-linkbtn"
            style={{ marginTop: 4, color: "var(--accent-strong)", fontSize: 13, fontWeight: 600 }}
            onClick={() => onOpenAi(lead)}
          >
            Ask the AI about this lead →
          </button>
        </div>
      </aside>
    </>
  );
}

/** A small on/off pill used by the notification rows. */
function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className="wc-toggle"
      style={{
        width: 38,
        height: 22,
        borderRadius: 99,
        background: on ? "var(--accent)" : "var(--line)",
        position: "relative",
        flex: "none",
        transition: ".15s",
      }}
    >
      <span
        className="wc-toggle-knob"
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 1px 2px rgba(0,0,0,.2)",
          transition: ".15s",
        }}
      />
    </span>
  );
}

/** An editable qualification field (click to edit, Enter/blur saves). */
function EditableField({
  label,
  value,
  field,
  suggestions,
  editingField,
  setEditingField,
  fieldDraft,
  setFieldDraft,
  onSave,
}: {
  label: string;
  value: string;
  field: string;
  suggestions?: readonly string[];
  editingField: string | null;
  setEditingField: (f: string | null) => void;
  fieldDraft: string;
  setFieldDraft: (v: string) => void;
  onSave: (field: string, value: unknown) => void;
}) {
  const isEditing = editingField === field;
  if (isEditing) {
    return (
      <div className="wc-field is-editing">
        <div className="wc-field-l">{label}</div>
        <input
          autoFocus
          className="wc-field-input"
          list={suggestions ? `dl-${field}` : undefined}
          value={fieldDraft}
          onChange={(e) => setFieldDraft(e.target.value)}
          onBlur={() => {
            setEditingField(null);
            if (fieldDraft.trim() !== value) onSave(field, fieldDraft.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditingField(null);
          }}
        />
        {suggestions ? (
          <datalist id={`dl-${field}`}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        ) : null}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="wc-field wc-field-btn"
      onClick={() => {
        setFieldDraft(value);
        setEditingField(field);
      }}
    >
      <div className="wc-field-l">{label}</div>
      <div className="wc-field-v">
        {value ? value : <span className="wc-field-empty">—</span>}
        <Pencil size={13} className="wc-field-pen" />
      </div>
    </button>
  );
}
