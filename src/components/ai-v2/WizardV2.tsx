import { Fragment, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Icon } from "./Icon";
import { Wcv2Portal } from "./Portal";
import { TONES } from "./tones";
import { AI_LIMITS } from "@/utils/aiLimits";
import { smsSegmentCount } from "@/utils/smsSegments";
import AttachmentGallery from "../AttachmentGallery";
import { LiveClock } from "../LiveClock";
import AttachmentChips from "../inbox/components/AttachmentChips";
import { uploadMessageAttachments, type UploadedAttachment } from "@/utils/messageAttachments";
import { describeStep, DEFAULT_STEP_SEND_TIME } from "@/utils/workflowSchedule";

const API_BASE = import.meta.env.VITE_API_BASE;
// Same gallery cap as the listing editor - keeps an automation's media list sane.
const MAX_WZ_FILES = 10;

/* Draft an opening message from the chosen audience + tone, so the wizard's
   "AI Write" button produces editable starter copy (the same role the inbound
   responder's AI Write plays). Tone sets the greeting; audience sets the body. */
const WZ_TONE_LEAD: Record<string, string> = {
  Personalize: "Hi {first_name}, ",
  Friendly: "Hey {first_name}! ",
  Professional: "Hello {first_name}, ",
  Direct: "{first_name} - ",
};
const WZ_AUD_BODY: Record<string, string> = {
  all: "I help buyers and sellers in the area and wanted to reach out. Is now a good time to talk through your options?",
  buyer: "I saw you were looking at homes in the area. Are you hoping to buy soon, or just starting to explore?",
  seller: "I can put together a free, no-obligation estimate of what your home could sell for. Want me to send it over?",
  new: "thanks for reaching out! What are you looking for, and how can I help you get started?",
};
function wzGenerate(aud: string, tone: string): string {
  return (WZ_TONE_LEAD[tone] ?? WZ_TONE_LEAD.Personalize) + (WZ_AUD_BODY[aud] ?? WZ_AUD_BODY.all);
}

// Mirror functions/_shared/automationHelpers.ts - keep in sync.
const MAX_AUTOMATION_NAME = 80;
const SMS_MAX_SEGMENTS = 5;
const MAX_FOLLOWUPS = 10;

/* Create Automation / Add Workflow wizard + Template gallery + Inbound
   responder modal - ported from the "leads-remix-2" design bundle (wizard.jsx).
   UI-only: every handler is local state, nothing talks to the backend yet. */

interface FollowUpData {
  after: number | string;
  at: string;
  tz: string;
  body: string;
}

export interface WizardSeed {
  name: string;
  channel: string;
  aud?: string;
  initial: string;
  fus: FollowUpData[];
  // Optional explicit link to an Outbound AI workflow card (o1-o5). When a seed
  // declares it, the created automation is governed by that card's toggle.
  workflowKey?: string;
}

interface TemplateStep {
  day: number;
  body: string;
  // Time of day the step sends (HH:MM, account timezone). Day 0 is instant and
  // ignores this. Defaults to 09:00 when omitted.
  at?: string;
}
interface WzTemplate {
  name: string;
  icon: string;
  channel: string;
  aud: string;
  tone: string;
  steps: TemplateStep[];
}

const WZ_TEMPLATES: WzTemplate[] = [
  {
    name: "Buyer Follow-Up", icon: "users", channel: "SMS", aud: "buyer", tone: "orange",
    steps: [
      { day: 0, body: "Hey {first_name}, saw you were interested in homes in {area} - are you looking to buy soon or just browsing?" },
      { day: 1, body: "Hi {first_name}, just wanted to follow up. Are you still looking to buy a home around {area}?" },
      { day: 3, body: "Hey {first_name}, not sure if you saw my last message - are you still interested in homes in {area}?" },
      { day: 5, body: "Hey {first_name}, I can send you a few good options in {area} if you're still looking. Want me to?" },
      { day: 7, body: "Hi {first_name}, I don't want to bug you - I'll assume timing isn't right. Feel free to reach out anytime!" },
    ],
  },
  {
    name: "Buyer Appointment Push", icon: "users", channel: "SMS", aud: "buyer", tone: "blue",
    steps: [
      { day: 0, body: "Hey {first_name}, want to see a few homes in {area} in person? I have time this week." },
      { day: 1, body: "Hi {first_name}, I can line up 2-3 showings back-to-back so it's easy. What day works?" },
      { day: 3, body: "Hey {first_name}, a couple of these homes are moving fast. Want to grab a showing before they go?" },
      { day: 5, body: "Hi {first_name}, happy to do a quick virtual tour first if that's easier. Interested?" },
      { day: 7, body: "Hey {first_name}, just checking - should I keep an eye out and reach back when something great hits?" },
    ],
  },
  {
    name: "Seller Follow-Up", icon: "home", channel: "SMS", aud: "seller", tone: "orange",
    steps: [
      { day: 0, body: "Hey {first_name}, I saw you were interested in your home value. Are you just curious, or thinking about selling soon?" },
      { day: 1, body: "Hi {first_name}, just wanted to follow up. I ran some numbers for homes near {area} - want a quick estimate of what your house can sell for?" },
      { day: 3, body: "Hey {first_name}, quick question - homes in {area} have been selling pretty fast lately. Have you thought about what you'd list your home for?" },
      { day: 5, body: "Hey {first_name}, no rush at all, just checking in. Even if you're not ready to sell, I can keep you updated on your home value over time." },
      { day: 7, body: "Hey {first_name}, I don't want to keep bugging you. Should I close this out for now, or are you still interested in seeing your home value?" },
    ],
  },
  {
    name: "Seller Appointment Push", icon: "home", channel: "SMS", aud: "seller", tone: "orange",
    steps: [
      { day: 0, body: "Hey {first_name}, based on what you shared, it may be worth a closer look at your home's value. Open to a quick 10-15 minute call?" },
      { day: 1, body: "Hi {first_name}, I can put together a free valuation before we talk so you have real numbers. Want me to?" },
      { day: 3, body: "Hey {first_name}, I have a couple of openings this week for a quick listing consult. Morning or afternoon better?" },
      { day: 5, body: "Hi {first_name}, even a 10-minute call can tell you a lot about your options. Want to grab a time?" },
      { day: 7, body: "Hey {first_name}, no pressure at all - want me to check back in a few weeks instead?" },
    ],
  },
  {
    name: "Re-engagement Automation", icon: "barChart", channel: "SMS", aud: "all", tone: "violet",
    steps: [
      { day: 0, body: "Hey {first_name}! It's been a while - the {area} market has shifted a lot. Want an updated list of homes in your range?" },
      { day: 1, body: "Hi {first_name}, a few new listings just came up that fit what you wanted. Want me to send them over?" },
      { day: 3, body: "Hey {first_name}, are your home search plans still active, or has anything changed?" },
      { day: 5, body: "Hi {first_name}, I can set up alerts so you only hear from me when something great hits. Want that?" },
      { day: 7, body: "Hey {first_name}, last check-in from me - just reply anytime you'd like to pick things back up!" },
    ],
  },
  {
    name: "Open House Follow-Up", icon: "message", channel: "SMS", aud: "new", tone: "green",
    steps: [
      { day: 0, body: "Hi {first_name}! Great meeting you at the open house today. What did you think of the place?" },
      { day: 1, body: "Hey {first_name}, here's the info sheet plus two similar homes nearby I think you'll like." },
      { day: 3, body: "Hi {first_name}, would you like to see any of these in person? I can set up a private showing." },
      { day: 5, body: "Hey {first_name}, are you working with an agent yet, or would it help if I sent matches each week?" },
      { day: 7, body: "Hi {first_name}, just checking in! Want me to keep you posted on new listings in {area}?" },
    ],
  },
];

function tplSeed(t: WzTemplate): WizardSeed {
  return {
    name: t.name,
    channel: t.channel,
    aud: t.aud,
    initial: t.steps[0].body,
    fus: t.steps.slice(1).map((s) => ({ after: s.day, at: s.at || DEFAULT_STEP_SEND_TIME, tz: "Pacific Time (PST/PDT)", body: s.body })),
  };
}

export function TemplateGallery({ onClose, onPick }: { onClose: () => void; onPick: (seed: WizardSeed) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const downOnScrim = useRef(false);
  return (
    <Wcv2Portal>
    <div className="wc-modal-scrim"
      onMouseDown={(e) => { downOnScrim.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && downOnScrim.current) onClose(); }}>
      <div className="wc-wz" onClick={(e) => e.stopPropagation()}>
        <button className="wc-modal-x" onClick={onClose}><Icon name="x" size={18} /></button>
        <div className="wc-wz-brand" style={{ marginBottom: 16 }}><Icon name="outbound" size={18} />Create Workflow From Template</div>
        <div className="wc-wz-head" style={{ marginBottom: 18 }}>
          <div><h2 className="wc-wz-title">Choose a Template</h2><p className="wc-wz-sub">Pick a proven follow-up sequence. Expand a card to preview its steps.</p></div>
        </div>
        <div className="wc-tplgal">
          {WZ_TEMPLATES.map((t, i) => {
            const tn = TONES[t.tone];
            const isOpen = open === i;
            const days = t.steps[t.steps.length - 1].day;
            return (
              <div className={"wc-tplgal-card" + (isOpen ? " is-open" : "")} key={t.name}>
                <div className="wc-tplgal-top">
                  <span className="wc-tplgal-ic" style={{ color: tn.fg, background: tn.bg }}><Icon name={t.icon} size={18} /></span>
                  <div className="wc-tplgal-id">
                    <div className="wc-tplgal-name">{t.name}<span className="wc-tplch ch-sms"><Icon name="message" size={11} />{t.channel}</span></div>
                    <div className="wc-band-d">{t.steps.length} steps &middot; Runs over {days} days &middot; Stops on reply</div>
                  </div>
                  <button className="wc-primary wc-sm" onClick={() => onPick(tplSeed(t))}>Use template</button>
                </div>
                <button className="wc-tplgal-toggle" onClick={() => setOpen(isOpen ? null : i)}>{isOpen ? "Hide steps" : "View steps"}<Icon name="chevronDown" size={15} style={isOpen ? { transform: "rotate(180deg)" } : {}} /></button>
                {isOpen && (
                  <div className="wc-tplgal-steps">
                    {t.steps.map((s, j) => {
                      const sc = describeStep(s.day, s.at, { instant: j === 0 });
                      return (
                        <div className="wc-tplgal-step" key={j}>
                          <span className="wc-tplgal-num">{j + 1}</span>
                          <div className="wc-tplgal-stepb">
                            <div className="wc-tplgal-day">{sc.dayLabel} &middot; <span className="wc-band-d">{sc.instant ? "sends instantly" : `${sc.dateLabel} · ${sc.timeLabel}`}</span></div>
                            <div className="wc-tplgal-msg">{s.body}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="wc-wz-foot"><button className="wc-ghostbtn" onClick={onClose}>Cancel</button><span /></div>
      </div>
    </div>
    </Wcv2Portal>
  );
}

interface IbTrigger {
  k: string;
  label: string;
  desc: string;
}
const IB_TRIGGERS: IbTrigger[] = [
  { k: "pricing", label: "Pricing question", desc: "Lead asks about price, payments, or offers" },
  { k: "showing", label: "Showing request", desc: "Lead wants to see a property" },
  { k: "financing", label: "Financing question", desc: "Lead asks about pre-approval or loans" },
  { k: "general", label: "General question", desc: "Any other inbound question" },
  { k: "keywords", label: "Specific keywords", desc: "Match words you choose" },
  { k: "missed", label: "Missed message", desc: "No agent reply within a set time" },
];
const IB_TONES = ["Friendly", "Professional", "Direct"];
const IB_SAMPLES: Record<string, string> = {
  pricing: "Hi {first_name}! Great question - that home is listed at {price}. Want me to pull a few comparable listings so you can see how it stacks up?",
  showing: "Hi {first_name}! I'd be happy to set up a showing. I have a couple of openings this week - what day works best for you?",
  financing: "Hi {first_name}! Happy to help. Are you already pre-approved, or would it help if I connected you with a trusted lender?",
  general: "Hi {first_name}! Thanks for reaching out - I'm here to help. Could you tell me a bit more about what you're looking for?",
  keywords: "Hi {first_name}! Thanks for your message - let me get you the right info.",
  missed: "Hi {first_name}! Sorry I missed you. I'm here now - what can I help you with?",
};

export function InboundResponderModal({
  onClose,
  onSave,
  initial,
}: {
  onClose: () => void;
  onSave: (data: { name: string; trigger: string; tone: string; message: string; keywords: string }) => void;
  initial?: { name?: string | null; trigger?: string | null; tone?: string | null; message?: string | null; keywords?: string | null };
}) {
  const initTrigger = initial?.trigger
    ? (IB_TRIGGERS.find((t) => t.label === initial.trigger)?.k ?? (initial.keywords ? "keywords" : "pricing"))
    : "pricing";
  const [name, setName] = useState(initial?.name ?? "");
  const [trigger, setTrigger] = useState(initTrigger);
  const [keywords, setKeywords] = useState(initial?.keywords ?? "");
  const [tone, setTone] = useState(initial?.tone || "Friendly");
  const [delay, setDelay] = useState("15");
  const [msg, setMsg] = useState(initial?.message ?? "");
  const [fallback, setFallback] = useState(false);
  const tObj = IB_TRIGGERS.find((t) => t.k === trigger);
  // Auto-responses are sent as SMS, so cap them at 5 segments (matches the inbox
  // composer + automation wizard). Block save when over the limit.
  const segCount = smsSegmentCount(msg);
  const overSeg = segCount > SMS_MAX_SEGMENTS;
  const can = name.trim() && msg.trim() && !overSeg && (trigger !== "keywords" || keywords.trim());
  const aiWrite = () => setMsg(IB_SAMPLES[trigger]);
  const downOnScrim = useRef(false);

  return (
    <Wcv2Portal>
    <div className="wc-modal-scrim"
      onMouseDown={(e) => { downOnScrim.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && downOnScrim.current) onClose(); }}>
      <div className="wc-modal wc-ibmodal" onClick={(e) => e.stopPropagation()}>
        <button className="wc-modal-x" onClick={onClose}><Icon name="x" size={18} /></button>
        <div className="wc-ib-head"><span className="wc-ib-head-ic"><Icon name="inbound" size={18} /></span><div><h2 className="wc-ib-title">{initial ? "Edit Auto-Response" : "New Auto-Response"}</h2><p className="wc-ib-sub">Inbound AI replies instantly when a message matches - in your tone.</p></div></div>

        <input className="wc-modal-title" style={{ fontSize: 18, marginTop: 4 }} maxLength={AI_LIMITS.responderName} placeholder="Rule name (e.g. Pricing replies)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />

        <div className="wc-modal-lbl" style={{ marginTop: 18 }}>When a lead sends a...</div>
        <div className="wc-ib-trigs">
          {IB_TRIGGERS.map((t) => (
            <button key={t.k} className={"wc-ib-trig" + (trigger === t.k ? " is-on" : "")} onClick={() => setTrigger(t.k)}>
              <div className="wc-ib-trig-t">{t.label}</div><div className="wc-band-d">{t.desc}</div>
            </button>
          ))}
        </div>

        {trigger === "keywords" && (
          <div className="wc-modal-fieldfull"><div className="wc-modal-lbl">Keywords (comma separated)</div><input className="wc-modal-input" maxLength={AI_LIMITS.responderKeywords} placeholder="price, cost, how much, payment" value={keywords} onChange={(e) => setKeywords(e.target.value)} /></div>
        )}
        {trigger === "missed" && (
          <div className="wc-modal-fieldfull"><div className="wc-modal-lbl">Send if no agent reply within</div><div className="wc-wz-after"><input className="wc-modal-input" style={{ width: 90 }} type="number" value={delay} onChange={(e) => setDelay(e.target.value)} /><span>minutes</span></div></div>
        )}

        <div className="wc-modal-lbl" style={{ marginTop: 16 }}>Response tone</div>
        <div className="wc-seg" style={{ margin: "0 0 16px" }}>
          {IB_TONES.map((o) => <button key={o} className={tone === o ? "is-on" : ""} onClick={() => setTone(o)}>{o}</button>)}
        </div>

        <div className="wc-wz-msghead"><span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><span className="wc-modal-lbl" style={{ margin: 0 }}>Auto-response message</span><LiveClock /></span><button className="wc-wz-aiwrite" onClick={aiWrite}><Icon name="sparkles" size={13} />AI Write</button></div>
        <textarea className="wc-wz-msg" style={{ minHeight: 100, marginTop: 8 }} maxLength={AI_LIMITS.responderMessage} placeholder={IB_SAMPLES[trigger]} value={msg} onChange={(e) => setMsg(e.target.value)} />
        <div style={{ fontSize: 10.5, color: (overSeg || msg.length >= AI_LIMITS.responderMessage) ? "#DC2626" : "var(--ink-3)", textAlign: "right", marginTop: 2 }}>{segCount} {segCount === 1 ? "segment" : "segments"} &middot; {msg.length}/{AI_LIMITS.responderMessage}{overSeg ? ` - max ${SMS_MAX_SEGMENTS} segments` : ""}</div>

        <label className="wc-wz-check" style={{ marginTop: 14 }}><input type="checkbox" checked={fallback} onChange={(e) => setFallback(e.target.checked)} /><span>Use as the general fallback when no other rule matches</span></label>

        <div className="wc-modal-foot">
          <button className="wc-ghostbtn" onClick={onClose}>Cancel</button>
          <button className="wc-primary" disabled={!can} onClick={() => onSave({ name: name.trim(), trigger: tObj ? tObj.label : "", tone, message: msg.trim(), keywords: keywords.trim() })}><Icon name="check" size={15} />Save Auto-Response</button>
        </div>
      </div>
    </div>
    </Wcv2Portal>
  );
}

const WZ_TZ = ["Pacific Time (PST/PDT)", "Mountain Time (MST/MDT)", "Central Time (CST/CDT)", "Eastern Time (EST/EDT)"];
const WZ_TONE_OPTS = ["Personalize", "Friendly", "Professional", "Direct"];

function WzProgress({ step }: { step: number }) {
  return (
    <div className="wc-wz-prog">
      {[1, 2, 3].map((n) => <div key={n} className={"wc-wz-progbar" + (n <= step ? " is-on" : "")} />)}
    </div>
  );
}

function FollowUp({
  fu,
  idx,
  onChange,
  onRemove,
}: {
  fu: FollowUpData;
  idx: number;
  onChange: (next: FollowUpData) => void;
  onRemove: () => void;
}) {
  return (
    <div className="wc-wz-fu">
      <div className="wc-wz-fu-head">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><span className="wc-wz-fu-title"><Icon name="clock" size={14} />Follow-Up #{idx + 1}</span><LiveClock /></span>
        <button className="wc-iconbtn-sm wc-danger" onClick={onRemove} title="Remove"><Icon name="trash" size={14} /></button>
      </div>
      <div className="wc-wz-fu-row">
        <div className="wc-wz-field"><label>Send after</label><div className="wc-wz-after"><input type="number" min="1" value={fu.after} onChange={(e) => onChange({ ...fu, after: e.target.value })} /><span>days</span></div></div>
        <div className="wc-wz-field"><label>Send at</label><input type="time" value={fu.at || DEFAULT_STEP_SEND_TIME} onChange={(e) => onChange({ ...fu, at: e.target.value })} /></div>
        <div className="wc-wz-field"><label>Time zone</label><div className="wc-wz-after" style={{ color: "var(--ink-3)" }} title="Send times use your account timezone (Settings - Workspace)"><Icon name="clock" size={13} /><span>Account time</span></div></div>
      </div>
      {(() => {
        const sc = describeStep(Number(fu.after) || 1, fu.at || DEFAULT_STEP_SEND_TIME);
        return <div className="wc-band-d" style={{ margin: "2px 0 6px", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="calendar" size={12} />If started today, lands {sc.dateLabel} at {sc.timeLabel}</div>;
      })()}
      <textarea className="wc-wz-msg" placeholder="Write your follow-up message..." value={fu.body} onChange={(e) => onChange({ ...fu, body: e.target.value })} />
      <div style={{ fontSize: 10.5, textAlign: "right", marginTop: 2, color: smsSegmentCount(fu.body) > SMS_MAX_SEGMENTS ? "#DC2626" : "var(--ink-3)" }}>{fu.body.length} chars &middot; {smsSegmentCount(fu.body)}/{SMS_MAX_SEGMENTS} segments</div>
    </div>
  );
}

export interface WizardLaunch {
  name: string;
  channel: string;
  audience: string;
  initial: string;
  // null = send the opening instantly on enroll; "HH:MM" = time it for that hour.
  opening_send_time: string | null;
  followups: { after: number | string; body: string; send_time: string }[];
  // Media picked from the shared attachment gallery (storage_key + url), stored
  // on the automation definition.
  attachments: { storage_key: string; url: string; name: string }[];
  workflowKey?: string;
  // "now" -> start the workflow immediately (the only option the wizard offers).
  timing: string;
}

export function WorkflowWizard({
  seed,
  onClose,
  onLaunch,
}: {
  agentName?: string;
  seed?: WizardSeed | null;
  onClose: () => void;
  onLaunch: (data: WizardLaunch) => void;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(seed ? seed.name : "");
  const [channel, setChannel] = useState(seed ? seed.channel : "SMS");
  // Audience picker was removed - leads enter a workflow one at a time as they
  // opt in, not by mass-adding a saved lead list. `aud` survives only as a hint
  // for the AI Write starter copy (seeded by a template, else "all").
  const [aud] = useState(seed && seed.aud ? seed.aud : "all");
  const [initial, setInitial] = useState(seed ? seed.initial : "");
  const [fus, setFus] = useState<FollowUpData[]>(seed && seed.fus ? seed.fus.map((f) => ({ ...f })) : []);
  // Send Now is the only option (the Manual/draft path was removed), so a created
  // workflow always starts running.
  const [timing] = useState("now");
  const [tone, setTone] = useState(WZ_TONE_OPTS[0]);
  const [stopReply, setStopReply] = useState(true);
  const [stopAppt, setStopAppt] = useState(true);
  // Opening message timing: instant by default, or scheduled for a wall-clock
  // hour on the enrollment day.
  const [openingTiming, setOpeningTiming] = useState<"instant" | "timed">("instant");
  const [openingAt, setOpeningAt] = useState(DEFAULT_STEP_SEND_TIME);

  // Shared attachment gallery (same component + storage as the inbox composer
  // and listing editor): upload to R2, re-pick from the gallery, preview chips.
  const token = localStorage.getItem("token") || "";
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const keyOf = (a: UploadedAttachment) => a.storage_key || a.id;
  const addAttachment = (a: UploadedAttachment) =>
    setAttachments((p) => (p.some((x) => keyOf(x) === keyOf(a)) || p.length >= MAX_WZ_FILES ? p : [...p, a]));
  const removeAttachment = (id: string) => setAttachments((p) => p.filter((x) => x.id !== id));
  const onUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const up = await uploadMessageAttachments(API_BASE, token, files);
      setAttachments((p) => [...p, ...up.filter((a) => !p.some((x) => keyOf(x) === keyOf(a)))].slice(0, MAX_WZ_FILES));
    } catch (e) {
      toast.error((e as Error)?.message || "Failed to upload");
    } finally {
      setUploading(false);
    }
  };

  const titles = ["Create New Workflow", "Craft Your Message", "Review & Launch"];
  const subs = ["Set up your outreach in seconds", "Write the message and follow-up sequence", "Double-check your workflow settings before sending"];
  // SMS messages are capped at 5 segments (matches the inbox composer). Email
  // has no segment cap. Block the message step until messages are within the limit.
  const isSms = channel === "SMS";
  const initialSegs = smsSegmentCount(initial);
  const overSeg = isSms && (initialSegs > SMS_MAX_SEGMENTS || fus.some((f) => smsSegmentCount(f.body) > SMS_MAX_SEGMENTS));
  // Every follow-up must have a body - an empty step would queue a blank message.
  const allFollowupsFilled = fus.every((f) => f.body.trim().length > 0);
  const canNext = step === 1 ? (name.trim() && name.length <= MAX_AUTOMATION_NAME) : step === 2 ? (initial.trim() && !overSeg && allFollowupsFilled) : true;
  const next = () => setStep((s) => Math.min(3, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));
  const addFu = () => setFus((f) => (f.length >= MAX_FOLLOWUPS ? f : [...f, { after: f.length === 0 ? 1 : 3, at: DEFAULT_STEP_SEND_TIME, tz: WZ_TZ[0], body: "" }]));

  return (
    <Wcv2Portal>
    {/* The wizard is a multi-step form, so an accidental outside click must NOT
        discard it - close only via the X / footer. No scrim onClick handler. */}
    <div className="wc-modal-scrim">
      <div className="wc-wz" onClick={(e) => e.stopPropagation()}>
        <button className="wc-modal-x" onClick={onClose}><Icon name="x" size={18} /></button>
        <div className="wc-wz-top">
          <div className="wc-wz-brand"><Icon name="outbound" size={18} />Create New Workflow</div>
        </div>
        <WzProgress step={step} />
        <div className="wc-wz-head">
          <div><h2 className="wc-wz-title">{titles[step - 1]}</h2><p className="wc-wz-sub">{subs[step - 1]}</p></div>
          <span className="wc-wz-step">Step {step} of 3</span>
        </div>

        <div className="wc-wz-body">
          {step === 1 && (
            <div>
              <div className="wc-wz-field"><label>Workflow Name</label><input className="wc-wz-bigin" maxLength={MAX_AUTOMATION_NAME} placeholder="Spring Buyer Leads" value={name} onChange={(e) => setName(e.target.value)} autoFocus /><div style={{ fontSize: 10.5, textAlign: "right", marginTop: 2, color: name.length >= MAX_AUTOMATION_NAME ? "#DC2626" : "var(--ink-3)" }}>{name.length}/{MAX_AUTOMATION_NAME}</div></div>
              <div className="wc-wz-label" style={{ marginTop: 20 }}>Choose Channel</div>
              <div className="wc-wz-chans">
                {[{ k: "SMS", icon: "message", desc: "Fast replies", tone: "orange" }, { k: "Email", icon: "mail", desc: "Rich content", tone: "blue" }].map((c) => {
                  const t = TONES[c.tone];
                  return (
                    <button key={c.k} className={"wc-wz-chan" + (channel === c.k ? " is-on" : "")} onClick={() => setChannel(c.k)}>
                      <span className="wc-wz-chan-ic" style={{ color: t.fg, background: t.bg }}><Icon name={c.icon} size={20} /></span>
                      <div><div className="wc-wz-chan-name">{c.k}</div><div className="wc-band-d">{c.desc}</div></div>
                    </button>
                  );
                })}
              </div>
              <div className="wc-wz-hints">
                <div><Icon name="checkCircle" size={13} /><strong>SMS</strong> - higher reply rate</div>
                <div><Icon name="checkCircle" size={13} /><strong>Email</strong> - better for long messages</div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="wc-wz-craft">
              <div className="wc-wz-craftmain">
                <div className="wc-wz-summary">
                  <div><div className="wc-wz-sumlbl">CHANNEL</div><div className="wc-wz-sumval">{channel}</div></div>
                  <div><div className="wc-wz-sumlbl">ENROLLMENT</div><div className="wc-wz-sumval">As leads opt in</div></div>
                </div>
                <div className="wc-panel-card pad">
                  <div className="wc-wz-msghead"><span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}><span className="wc-card-h2 sm"><Icon name="sparkles" size={14} />Initial Message</span><LiveClock /></span>
                    <div className="wc-wz-msgtools" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <select className="wc-wz-selsm" style={{ maxWidth: 140 }} value={tone} onChange={(e) => setTone(e.target.value)} title="Tone for AI Write">{WZ_TONE_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                      <button type="button" className="wc-wz-aiwrite" style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => setInitial(wzGenerate(aud, tone))}><Icon name="sparkles" size={13} />AI Write</button>
                    </div>
                  </div>
                  <textarea className="wc-wz-msg" style={{ minHeight: 120 }} placeholder={"Hi {first_name},\n\nI wanted to reach out because..."} value={initial} onChange={(e) => setInitial(e.target.value)} />
                  <div className="wc-wz-msgfoot">
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                        <Icon name="plus" size={13} />{uploading ? "Uploading..." : "Add files"}
                        <input type="file" multiple className="hidden" disabled={uploading} onChange={(e) => { onUpload(e.target.files); e.target.value = ""; }} />
                      </label>
                      {token && <AttachmentGallery apiBase={API_BASE} token={token} isBottom onSelect={addAttachment} onDelete={(key) => setAttachments((p) => p.filter((x) => keyOf(x) !== key))} />}
                    </div>
                    <span className="wc-band-d" style={{ color: isSms && initialSegs > SMS_MAX_SEGMENTS ? "#DC2626" : undefined }}>{initial.length} chars{isSms ? ` · ${initialSegs}/${SMS_MAX_SEGMENTS} segments${initialSegs > SMS_MAX_SEGMENTS ? " - too long" : ""}` : ""}</span>
                  </div>
                  {attachments.length > 0 && <div style={{ marginTop: 10 }}><AttachmentChips attachments={attachments} removable onRemove={removeAttachment} /></div>}
                  <div className="wc-wz-fu-row" style={{ marginTop: 14, alignItems: "flex-end" }}>
                    <div className="wc-wz-field">
                      <label>When to send the opening</label>
                      <div className="wc-seg" style={{ margin: 0 }}>
                        <button type="button" className={openingTiming === "instant" ? "is-on" : ""} onClick={() => setOpeningTiming("instant")}>Instant</button>
                        <button type="button" className={openingTiming === "timed" ? "is-on" : ""} onClick={() => setOpeningTiming("timed")}>At a time</button>
                      </div>
                    </div>
                    {openingTiming === "timed" && (
                      <div className="wc-wz-field"><label>Send at</label><input type="time" value={openingAt} onChange={(e) => setOpeningAt(e.target.value)} /></div>
                    )}
                  </div>
                  <div className="wc-band-d" style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Icon name={openingTiming === "instant" ? "zap" : "clock"} size={12} />
                    {openingTiming === "instant"
                      ? "Sends the moment a lead is enrolled."
                      : `Sends on the enrollment day at ${describeStep(0, openingAt).timeLabel} (account time).`}
                  </div>
                </div>
                <div className="wc-wz-fuhead"><span className="wc-card-h2 sm"><Icon name="clock" size={14} />Follow-Up Sequence <span className="wc-band-d">(Optional)</span></span><button className="wc-primary wc-sm" disabled={fus.length >= MAX_FOLLOWUPS} onClick={addFu}><Icon name="plus" size={13} />Add Follow-Up</button></div>
                {fus.map((fu, i) => <FollowUp key={i} fu={fu} idx={i} onChange={(v) => setFus((f) => f.map((x, idx) => (idx === i ? v : x)))} onRemove={() => setFus((f) => f.filter((_, idx) => idx !== i))} />)}
                {fus.length === 0 && <div className="wc-wz-fuempty">No follow-ups yet. Add one to nudge leads who don't reply.</div>}
              </div>
              <div className="wc-wz-preview">
                <div className="wc-card-h2 sm" style={{ marginBottom: 10 }}>Templates &amp; Preview</div>
                <div className="wc-wz-prevcard">
                  <div className="wc-wz-prevlbl">Preview</div>
                  <div className="wc-wz-prevbody" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", overflowY: "auto", maxHeight: 320 }}>{initial ? initial.replace("{first_name}", "Sarah") : "Preview your message here."}</div>
                </div>
                <p className="wc-band-d" style={{ marginTop: 10 }}>Each recipient receives their own personalized version.</p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="wc-wz-revcards">
                <div className="wc-wz-revcard"><div className="wc-wz-sumlbl"><Icon name="users" size={13} />Enrollment</div><div className="wc-wz-revval" style={{ fontSize: 15 }}>Opt-in</div><div className="wc-band-d">as leads join</div></div>
                <div className="wc-wz-revcard"><div className="wc-wz-sumlbl"><Icon name="message" size={13} />Channel</div><div className="wc-wz-revval">{channel}</div><div className="wc-band-d">1 channel</div></div>
                <div className="wc-wz-revcard"><div className="wc-wz-sumlbl"><Icon name="clock" size={13} />Follow-ups</div><div className="wc-wz-revval wc-mono">{fus.length}</div><div className="wc-band-d">messages</div></div>
                <div className="wc-wz-revcard"><div className="wc-wz-sumlbl"><Icon name="checkCircle" size={13} />Stop rules</div><div className="wc-wz-revval" style={{ fontSize: 15 }}>{[stopReply && "Reply", stopAppt && "Appt"].filter(Boolean).join(" + ") || "None"}</div><div className="wc-band-d">{[stopReply, stopAppt].filter(Boolean).length} rules active</div></div>
              </div>

              <div className="wc-wz-label" style={{ marginTop: 20 }}>Message Flow - how this workflow runs</div>
              <div className="wc-wz-flow">
                <div className="wc-flowstep is-trigger">
                  <span className="wc-flowstep-ic"><Icon name="zap" size={15} /></span>
                  <div><div className="wc-flowstep-t">Lead opts in</div><div className="wc-flowstep-d">A lead joins through an intake (form / integration)</div></div>
                </div>
                <div className="wc-flowarrow"><span /><Icon name="arrowDown" size={14} /></div>
                <div className="wc-flowstep">
                  <span className="wc-flowstep-ic" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}><Icon name={channel === "Email" ? "mail" : "message"} size={15} /></span>
                  <div><div className="wc-flowstep-t">Initial {channel} &middot; {openingTiming === "instant" ? "sent instantly" : `sent at ${describeStep(0, openingAt).timeLabel} on day 0`}</div><div className="wc-flowstep-d">{initial ? '"' + initial.slice(0, 60).replace("{first_name}", "Sarah") + (initial.length > 60 ? "..." : "") + '"' : "No message yet"}</div></div>
                </div>
                {fus.map((fu, i) => {
                  const sc = describeStep(Number(fu.after) || 1, fu.at || DEFAULT_STEP_SEND_TIME);
                  return (
                  <Fragment key={i}>
                    <div className="wc-flowarrow"><span /><span className="wc-flowwait">wait {fu.after || 1} day{(Number(fu.after) || 1) > 1 ? "s" : ""}</span><Icon name="arrowDown" size={14} /></div>
                    <div className="wc-flowstep">
                      <span className="wc-flowstep-ic" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)" }}><Icon name={channel === "Email" ? "mail" : "message"} size={15} /></span>
                      <div><div className="wc-flowstep-t">Follow-Up #{i + 1} &middot; {sc.dayLabel} at {sc.timeLabel}</div><div className="wc-flowstep-d">{sc.dateLabel ? `${sc.dateLabel} · ` : ""}{fu.body ? '"' + fu.body.slice(0, 50) + (fu.body.length > 50 ? "..." : "") + '"' : "No message yet"}</div></div>
                    </div>
                  </Fragment>
                  );
                })}
                <div className="wc-flowarrow"><span /><Icon name="arrowDown" size={14} /></div>
                <div className="wc-flowstep is-stop">
                  <span className="wc-flowstep-ic" style={{ background: "#E8F8ED", color: "#16A34A" }}><Icon name="checkCircle" size={15} /></span>
                  <div><div className="wc-flowstep-t">Workflow stops</div><div className="wc-flowstep-d">{[stopReply && "when lead replies", stopAppt && "when appointment booked"].filter(Boolean).join(" or ") || "after last message"}</div></div>
                </div>
              </div>

              <div className="wc-wz-label" style={{ marginTop: 18 }}>Send Timing</div>
              <div className="wc-wz-timing is-on">
                <span className="wc-radio is-on" />
                <div><div className="wc-wz-chan-name">Start WorkFlow</div><div className="wc-band-d">The workflow starts running immediately after you launch it.</div></div>
              </div>
              <div className="wc-wz-label" style={{ marginTop: 18 }}>Workflow Stop Rules</div>
              <label className="wc-wz-check"><input type="checkbox" checked={stopReply} onChange={(e) => setStopReply(e.target.checked)} /><span>Stop follow-ups when lead replies</span></label>
              <label className="wc-wz-check"><input type="checkbox" checked={stopAppt} onChange={(e) => setStopAppt(e.target.checked)} /><span>Stop when appointment is booked</span></label>
              <div className="wc-wz-tcpa"><Icon name="checkCircle" size={15} /><div><strong>TCPA-compliant by default</strong><ul><li>Recipients who reply STOP are auto-removed.</li><li>Every email includes a List-Unsubscribe header.</li><li>Quiet hours (8 AM-9 PM local) are enforced.</li></ul></div></div>
            </div>
          )}
        </div>

        <div className="wc-wz-foot">
          {step > 1 ? <button className="wc-ghostbtn" onClick={back}><Icon name="chevronDown" size={15} style={{ transform: "rotate(90deg)" }} />Back</button> : <span />}
          {step < 3
            ? <button className="wc-primary" disabled={!canNext} onClick={next}>Continue <Icon name="arrowRight" size={15} /></button>
            : <button className="wc-primary" onClick={() => onLaunch({ name, channel, audience: aud, initial, opening_send_time: openingTiming === "timed" ? (openingAt || DEFAULT_STEP_SEND_TIME) : null, followups: fus.map((f) => ({ after: f.after, body: f.body, send_time: (f.at || DEFAULT_STEP_SEND_TIME) })), attachments: attachments.map((a) => ({ storage_key: keyOf(a), url: a.url, name: a.name })), timing, ...(seed?.workflowKey ? { workflowKey: seed.workflowKey } : {}) })}><Icon name="outbound" size={15} />Start Workflow</button>}
        </div>
      </div>
    </div>
    </Wcv2Portal>
  );
}
