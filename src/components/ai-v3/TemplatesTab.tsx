import { useState, type Dispatch, type SetStateAction } from "react";
import { Icon } from "./Icon";
import { V3Portal } from "./Portal";
import { OUTBOUND_TEMPLATES, TEMPLATE_CH, SEND_TIME } from "./templatesData";

/* Outbound "Templates" tab — rebuilt from docs/updated-docs/templates-tab.prompt.md.
   A grid of reusable message-template cards (the shared OUTBOUND_TEMPLATES
   library), each previewable in SMS or Email, expandable to the full send
   sequence, and editable / deletable / creatable via modals. List state is
   local to the tab. Class prefix wc-tpl-. */

export interface TplStep { day: string; instant?: boolean; channel: string; time?: string; text?: string; subject?: string; body?: string; _hhmm?: string; tz?: string }
export interface TplItem { id: string; channel: string; name: string; stage: string; sent: number; emailSent?: number; message?: string; flow: TplStep[]; emailFlow?: TplStep[] }

// ---- helpers ---------------------------------------------------------------
function VarText({ text }: { text: string }) {
  return (
    <>
      {String(text).split(/(\{\{[^}]+\}\})/g).map((p, i) =>
        /^\{\{[^}]+\}\}$/.test(p) ? <span key={i} className="wc-tpl-var">{p}</span> : <span key={i}>{p}</span>,
      )}
    </>
  );
}
function MsgBody({ text }: { text: string }) {
  return (
    <>
      {String(text).split("\n").map((ln, i) => (
        <div key={i} className={ln.trim().startsWith("•") ? "wc-tpl-bullet" : undefined}><VarText text={ln} /></div>
      ))}
    </>
  );
}
function StepContent({ s }: { s: TplStep }) {
  if (s.subject != null) return (
    <div className="wc-tpl-step-text">
      <div className="wc-tpl-subj"><span className="wc-tpl-subj-k">Subject:</span> <VarText text={s.subject} /></div>
      <div className="wc-tpl-emailbody"><MsgBody text={s.body || ""} /></div>
    </div>
  );
  return <div className="wc-tpl-step-text"><VarText text={s.text || ""} /></div>;
}
function ChannelPill({ channel, size }: { channel: string; size?: string }) {
  const c = TEMPLATE_CH[channel] || TEMPLATE_CH.sms;
  return (
    <span className={"wc-tpl-pill" + (size === "sm" ? " is-sm" : "")} style={{ background: c.bg, color: c.fg }}>
      <Icon name={c.icon} size={size === "sm" ? 11 : 12} />{c.label}
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

function tplFmtTime(hhmm: string): string { // "13:00" -> "1:00 PM"
  const [h, m] = String(hhmm).split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM"; const hh = ((h + 11) % 12) + 1;
  return hh + ":" + String(m || 0).padStart(2, "0") + " " + ap;
}
function tplParseHHMM(str: string | undefined): string { // "10:00 AM PST" -> "10:00"
  const m = String(str || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return "10:00";
  let h = +m[1]; const min = m[2]; const ap = (m[3] || "").toUpperCase();
  if (ap === "PM" && h < 12) h += 12; if (ap === "AM" && h === 12) h = 0;
  return String(h).padStart(2, "0") + ":" + min;
}
function tplParseTZ(str: string | undefined): string { const m = String(str || "").match(/\b(PST|EST|CST|MST)\b/); return m ? m[1] : "PST"; }

// ---- expanded send sequence ------------------------------------------------
function TemplateFlow({ flow }: { flow: TplStep[] }) {
  return (
    <div className="wc-tpl-flow">
      <div className="wc-tpl-flow-h">
        <span>Send sequence · {flow.length} {flow.length === 1 ? "message" : "messages"}</span>
        <span className="wc-tpl-flow-tz"><Icon name="clock" size={12} />Times in the lead's timezone</span>
      </div>
      <div className="wc-tpl-steps">
        {flow.map((s, i) => (
          <div className="wc-tpl-step" key={i}>
            <div className="wc-tpl-rail">
              <span className="wc-tpl-node" style={{ background: (TEMPLATE_CH[s.channel] || TEMPLATE_CH.sms).bg }}>{i + 1}</span>
              {i < flow.length - 1 && <span className="wc-tpl-line" />}
            </div>
            <div className="wc-tpl-step-body">
              <div className="wc-tpl-step-meta">
                <span className="wc-tpl-day">{s.day}</span>
                <span className="wc-tpl-dot">·</span>
                {s.instant
                  ? <span className="wc-tpl-time is-instant"><Icon name="zap" size={12} />Send instantly</span>
                  : <span className="wc-tpl-time"><Icon name="clock" size={12} />{s.time || SEND_TIME}</span>}
                <ChannelPill channel={s.channel} size="sm" />
              </div>
              <StepContent s={s} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- confirm delete --------------------------------------------------------
function ConfirmDelete({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <V3Portal>
      <div className="wc-tpl-modal-ov" onClick={onCancel}>
        <div className="wc-confirm" onClick={(e) => e.stopPropagation()}>
          <div className="wc-confirm-ic"><Icon name="trash" size={24} /></div>
          <div className="wc-confirm-t">Delete template?</div>
          <div className="wc-confirm-d"><strong>{name}</strong> will be permanently removed. This can't be undone.</div>
          <div className="wc-confirm-acts">
            <button className="wc-tpl-mbtn" onClick={onCancel}>Cancel</button>
            <button className="wc-confirm-del" onClick={onConfirm}><Icon name="trash" size={15} />Delete</button>
          </div>
        </div>
      </div>
    </V3Portal>
  );
}

// ---- edit modal ------------------------------------------------------------
function TemplateEditModal({ t, ch, onClose, onSave }: { t: TplItem; ch: string; onClose: () => void; onSave: (patch: Partial<TplItem>) => void }) {
  const hasEmail = Array.isArray(t.emailFlow);
  const activeKey: "emailFlow" | "flow" = ch === "email" && hasEmail ? "emailFlow" : "flow";
  const [name, setName] = useState(t.name);
  const [stage, setStage] = useState(t.stage);
  const [steps, setSteps] = useState<TplStep[]>(() => (t[activeKey] || []).map((s) => ({ ...s, _hhmm: tplParseHHMM(s.time), tz: tplParseTZ(s.time) })));
  const updateStep = (i: number, patch: Partial<TplStep>) => setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const save = () => { onSave({ name, stage, [activeKey]: steps }); onClose(); };
  return (
    <V3Portal>
      <div className="wc-tpl-modal-ov" onClick={onClose}>
        <div className="wc-tpl-modal" onClick={(e) => e.stopPropagation()}>
          <div className="wc-tpl-modal-h">
            <div className="wc-tpl-modal-t"><Icon name="pencil" size={18} style={{ color: "var(--accent-strong)" }} /> Edit Template</div>
            <button className="wc-tpl-modal-x" onClick={onClose}><Icon name="x" size={20} /></button>
          </div>
          <div className="wc-tpl-modal-body">
            <label className="wc-tpl-flabel">Template Name</label>
            <input className="wc-tpl-finput" value={name} onChange={(e) => setName(e.target.value)} />
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <label className="wc-tpl-flabel">Category</label>
                <input className="wc-tpl-finput" value={stage} onChange={(e) => setStage(e.target.value)} />
              </div>
              <div style={{ flex: "none" }}>
                <label className="wc-tpl-flabel">Channel</label>
                <div className="wc-tpl-finput is-static"><ChannelPill channel={ch} size="sm" /></div>
              </div>
            </div>
            <label className="wc-tpl-flabel">Messages · {steps.length}</label>
            <div className="wc-tpl-msglist">
              {steps.map((s, i) => (
                <div className="wc-tpl-msgedit" key={i}>
                  <div className="wc-tpl-msgedit-h"><span className="wc-tpl-node" style={{ background: (TEMPLATE_CH[s.channel] || TEMPLATE_CH.sms).bg, boxShadow: "none" }}>{i + 1}</span><span>Message {i + 1}</span></div>
                  <div className="wc-tpl-when">
                    <label className="wc-tpl-inst"><input type="checkbox" checked={!!s.instant} onChange={(e) => updateStep(i, { instant: e.target.checked })} style={{ accentColor: "var(--accent)" }} /> Send instantly</label>
                    {!s.instant && (
                      <>
                        <input className="wc-tpl-finput wc-tpl-day" value={s.day} onChange={(e) => updateStep(i, { day: e.target.value })} placeholder="Day 1" />
                        <span className="wc-tpl-at">at</span>
                        <input type="time" className="wc-tpl-finput wc-tpl-timein" value={s._hhmm} onChange={(e) => updateStep(i, { _hhmm: e.target.value, time: tplFmtTime(e.target.value) + " " + (s.tz || "PST") })} />
                        <select className="wc-tpl-finput wc-tpl-tzsel" value={s.tz || "PST"} onChange={(e) => updateStep(i, { tz: e.target.value, time: tplFmtTime(s._hhmm || "10:00") + " " + e.target.value })}><option>PST</option><option>EST</option><option>CST</option><option>MST</option></select>
                      </>
                    )}
                  </div>
                  {s.subject != null ? (
                    <>
                      <input className="wc-tpl-finput" value={s.subject} onChange={(e) => updateStep(i, { subject: e.target.value })} placeholder="Subject" />
                      <textarea className="wc-tpl-fta" value={s.body} onChange={(e) => updateStep(i, { body: e.target.value })} />
                    </>
                  ) : (
                    <textarea className="wc-tpl-fta" value={s.text} onChange={(e) => updateStep(i, { text: e.target.value })} />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="wc-tpl-modal-foot">
            <button className="wc-tpl-mbtn" onClick={onClose}>Cancel</button>
            <button className="wc-tpl-mbtn is-primary" onClick={save}><Icon name="check" size={15} />Save changes</button>
          </div>
        </div>
      </div>
    </V3Portal>
  );
}

// ---- create modal ----------------------------------------------------------
// ---- card ------------------------------------------------------------------
function TemplateCard({ t, onSave, onDelete }: { t: TplItem; onSave: (patch: Partial<TplItem>) => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const hasEmail = Array.isArray(t.emailFlow);
  const [ch, setCh] = useState(t.channel || "sms");
  const flow = ch === "email" && hasEmail ? t.emailFlow! : t.flow;
  const sentCount = ch === "email" && hasEmail ? (t.emailSent ?? 0) : t.sent;
  const first = flow[0];
  return (
    <div className={"wc-tpl-card" + (open ? " is-open" : "")}>
      <div className="wc-tpl-top">
        {hasEmail ? <ChannelToggle value={ch} onChange={setCh} /> : <ChannelPill channel={ch} />}
        <div className="wc-tpl-acts">
          <button className="wc-tpl-iconbtn" title="Edit template" onClick={() => setEditing(true)}><Icon name="pencil" size={16} /></button>
          <button className="wc-tpl-iconbtn is-danger" title="Delete template" onClick={() => setConfirmDel(true)}><Icon name="trash" size={16} /></button>
        </div>
      </div>
      <div className="wc-tpl-title">{t.name}</div>
      <div className="wc-tpl-stage">{t.stage} · {sentCount} SENT · {flow.length} MSGS</div>
      <div className="wc-tpl-msg">
        <div className="wc-tpl-msg-label">{ch === "email" ? "First email" : "First message"}</div>
        {ch === "email"
          ? <div className="wc-tpl-msg-body"><div className="wc-tpl-subj"><span className="wc-tpl-subj-k">Subject:</span> <VarText text={first.subject || ""} /></div><div className="wc-tpl-emailbody"><MsgBody text={first.body || ""} /></div></div>
          : <div className="wc-tpl-msg-body"><VarText text={first.text || ""} /></div>}
      </div>
      <button className="wc-tpl-view" onClick={() => setOpen((o) => !o)}>
        <Icon name="layers" size={16} />{open ? "Hide template" : "View template"}
        <Icon name="chevronDown" size={15} style={{ marginLeft: "2px", transition: "transform .2s", transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && <TemplateFlow flow={flow} />}
      {editing && <TemplateEditModal t={t} ch={ch} onClose={() => setEditing(false)} onSave={onSave} />}
      {confirmDel && <ConfirmDelete name={t.name} onCancel={() => setConfirmDel(false)} onConfirm={() => { setConfirmDel(false); onDelete(); }} />}
    </div>
  );
}

// ---- tab -------------------------------------------------------------------
// The list is owned by the parent (Outbound body) so the "+ New template"
// wizard can prepend a saved template to it. onNew opens that wizard.
export function TemplatesTab({ list, setList, onNew }: { list: TplItem[]; setList: Dispatch<SetStateAction<TplItem[]>>; onNew: () => void }) {
  const updateT = (id: string, patch: Partial<TplItem>) => setList((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const removeT = (id: string) => setList((prev) => prev.filter((t) => t.id !== id));
  return (
    <div className="wc-tpl-wrap">
      <div className="wc-tpl-head">
        <div className="wc-tpl-headline">
          <strong>{list.length} templates</strong>
          <span className="wc-tpl-sub"> · variables like <span className="wc-tpl-var">{"{{first_name}}"}</span> fill in automatically</span>
        </div>
        <div className="wc-tpl-head-r">
          <button className="wc-tpl-new" onClick={onNew}><Icon name="plus" size={17} />New template</button>
        </div>
      </div>
      <div className="wc-tpl-grid">
        {list.map((t) => <TemplateCard key={t.id} t={t} onSave={(p) => updateT(t.id, p)} onDelete={() => removeT(t.id)} />)}
      </div>
    </div>
  );
}
