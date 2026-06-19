import { useState } from "react";
import { Icon } from "./Icon";
import { V3Portal } from "./Portal";
import type { WizardSeed, FollowUp } from "./WorkflowWizard";
import { OUTBOUND_TEMPLATES, SEND_TIME, TEMPLATE_CH, dayOffset, type Template, type FlowStep, type SmsStep } from "./templatesData";

/* "Create Workflow From Template -> Choose a Template" modal.
   Rebuilt from docs/updated-docs/browse-templates-modal.prompt.md. Nine proven
   follow-up sequences (shared templatesData), an SMS/Email channel toggle, a
   per-card expandable step timeline with real computed send dates, and "Use
   template" seeds the Create-Workflow wizard (opening message + follow-ups). */

const WF_TEMPLATE_META: Record<string, { icon: string; tone: string }> = {
  t1: { icon: "users", tone: "orange" },
  t2: { icon: "users", tone: "blue" },
  t3: { icon: "home", tone: "orange" },
  t4: { icon: "home", tone: "orange" },
  t5: { icon: "refresh", tone: "violet" },
  t6: { icon: "home", tone: "green" },
  t7: { icon: "target", tone: "blue" },
  t8: { icon: "star", tone: "violet" },
  t9: { icon: "clock", tone: "green" },
};
const WF_TONES: Record<string, { bg: string; fg: string }> = {
  orange: { bg: "var(--accent-soft)", fg: "var(--accent-strong)" },
  blue: { bg: "var(--blue-bg)", fg: "var(--blue)" },
  violet: { bg: "var(--violet-bg)", fg: "var(--violet)" },
  green: { bg: "var(--green-bg)", fg: "var(--green)" },
};

function runsLabel(flow: FlowStep[]): string {
  const d = dayOffset(flow[flow.length - 1].day);
  if (d === 0) return "Same day";
  return "Runs over " + d + " days";
}
function stepDate(offset: number): string {
  const dt = new Date();
  dt.setDate(dt.getDate() + offset);
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function VarText({ text }: { text: string }) {
  return (
    <>
      {String(text).split(/(\{\{[^}]+\}\})/g).map((p, i) =>
        /^\{\{[^}]+\}\}$/.test(p) ? <span key={i} className="wc-tpl-var">{p}</span> : <span key={i}>{p}</span>,
      )}
    </>
  );
}
function ChannelPill({ channel }: { channel: string }) {
  const c = TEMPLATE_CH[channel] || TEMPLATE_CH.sms;
  return (
    <span className="wc-wft-pill" style={{ background: c.bg, color: c.fg }}>
      <Icon name={c.icon} size={11} />{c.label}
    </span>
  );
}
function ChannelToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="wc-tpl-chtoggle">
      {["sms", "email"].map((ch) => {
        const c = TEMPLATE_CH[ch]; const on = value === ch;
        return (
          <button key={ch} className={"wc-tpl-chbtn" + (on ? " is-on" : "")} style={on ? { background: c.bg, color: c.fg } : undefined} onClick={() => onChange(ch)}>
            <Icon name={c.icon} size={13} />{c.label}
          </button>
        );
      })}
    </div>
  );
}

function WfTemplateCard({ t, channel, onUse }: { t: Template; channel: string; onUse: (t: Template, channel: string) => void }) {
  const [open, setOpen] = useState(false);
  const meta = WF_TEMPLATE_META[t.id] || { icon: "layers", tone: "orange" };
  const tone = WF_TONES[meta.tone];
  const flow: FlowStep[] = channel === "email" && Array.isArray(t.emailFlow) ? t.emailFlow : t.flow;
  return (
    <div className={"wc-wft-card" + (open ? " is-open" : "")}>
      <div className="wc-wft-head">
        <span className="wc-wft-tile" style={{ background: tone.bg, color: tone.fg }}><Icon name={meta.icon} size={22} /></span>
        <div className="wc-wft-info">
          <div className="wc-wft-title-row">
            <span className="wc-wft-title">{t.name}</span>
            <ChannelPill channel={channel} />
          </div>
          <div className="wc-wft-meta">{flow.length} steps · {runsLabel(flow)} · Stops on reply</div>
        </div>
        <button className="wc-wft-use" onClick={() => onUse(t, channel)}>Use template</button>
      </div>
      <button className="wc-wft-viewsteps" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide steps" : "View steps"}
        <Icon name="chevronDown" size={16} style={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && (
        <div className="wc-wft-steps">
          {flow.map((s, i) => (
            <div className="wc-wft-step" key={i}>
              <div className="wc-wft-rail">
                <span className="wc-wft-node">{i + 1}</span>
                {i < flow.length - 1 && <span className="wc-wft-line" />}
              </div>
              <div className="wc-wft-step-body">
                <div className="wc-wft-step-when">
                  {s.instant || i === 0
                    ? <><strong>Instant</strong> · sends instantly</>
                    : <><strong>{s.day}</strong> · {stepDate(dayOffset(s.day))} · {SEND_TIME}</>}
                </div>
                <div className="wc-wft-step-text">
                  {"subject" in s
                    ? <><strong>{s.subject}</strong><br /><VarText text={s.body} /></>
                    : <VarText text={s.text} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Convert a chosen template + channel into a wizard seed (opening + follow-ups). */
function buildSeed(t: Template, chan: string): WizardSeed {
  const useChan = chan === "email" ? "email" : "sms";
  const flow: FlowStep[] = useChan === "email" && Array.isArray(t.emailFlow) ? t.emailFlow : t.flow;
  const opening = flow[0];
  const followups: FollowUp[] = flow.slice(1).map((s, i) => ({
    id: Date.now() + i + 1,
    time: "10:00",            // 10:00 AM in the account/lead timezone
    timezone: "",             // empty = use the account timezone (EST/whatever it is)
    channel: useChan,
    delayDays: dayOffset(s.day), // Day 1 / 3 / 5 / 7 (message 2/3/4/5)
    message: "subject" in s ? s.body : s.text,
    ...("subject" in s ? { subject: s.subject } : {}),
  }));
  return {
    name: t.name,
    channel: useChan,
    message: opening && "subject" in opening ? opening.body : (opening as SmsStep)?.text || "",
    subject: opening && "subject" in opening ? opening.subject : "",
    followups,
  };
}

export function BrowseTemplatesModal({ onClose, onUse }: { onClose: () => void; onUse: (seed: WizardSeed) => void }) {
  const [channel, setChannel] = useState("sms");
  return (
    <V3Portal>
      <div className="wc-wft-overlay" onClick={onClose}>
        <div className="wc-wft-modal" onClick={(e) => e.stopPropagation()}>
          <div className="wc-wft-topbar">
            <div className="wc-wft-eyebrow"><Icon name="arrowRight" size={18} style={{ color: "var(--accent-strong)" }} /> Create Workflow From Template</div>
            <button className="wc-wft-close" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button>
          </div>
          <h2 className="wc-wft-h">Choose a Template</h2>
          <p className="wc-wft-sub">Pick a proven follow-up sequence. Switch channel to preview the SMS or Email version.</p>
          <div className="wc-wft-chrow"><ChannelToggle value={channel} onChange={setChannel} /></div>
          <div className="wc-wft-grid">
            {OUTBOUND_TEMPLATES.map((t) => (
              <WfTemplateCard key={t.id} t={t} channel={channel} onUse={(tmpl, ch) => onUse(buildSeed(tmpl, ch))} />
            ))}
          </div>
          <div className="wc-wft-foot">
            <button className="wc-wft-cancel" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </V3Portal>
  );
}

