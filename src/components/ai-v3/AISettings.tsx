import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Icon } from "./Icon";
import { fetchAiSettings, updateAiSettings, fetchAutoResponse, updateAutoResponse, fetchAgentProfile, updateAgentProfile, fetchAiQualifications, createAiQualification, deleteAiQualification, fetchMeBootstrap, patchNotificationSettings } from "../../helpers/backend";

/* AI Settings sub-tab — ported from docs/updated-docs/ai-agent.jsx (§6).
   Self-contained. The master AI on/off is wired to the real /ai/settings
   master switch; the granular per-feature toggles are UI-level for now. */

const AI_QUERY_OPTS = { staleTime: 30_000, refetchOnWindowFocus: false } as const;

function Toggle({ on, onChange }: { on: boolean; onChange: (n: boolean) => void }) {
  return (
    <button type="button" className={"wc-toggle" + (on ? " is-on" : "")} aria-pressed={on} onClick={(e) => { e.stopPropagation(); onChange(!on); }}>
      <span className="wc-toggle-knob" />
    </button>
  );
}

function SetCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="wc-set-card">
      <div className="wc-set-card-h">
        <div className="wc-set-card-t">{title}</div>
        {desc && <div className="wc-set-card-d">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function SetToggleRow({ title, desc, on, onChange }: { title: string; desc?: string; on: boolean; onChange: (n: boolean) => void }) {
  return (
    <div className="wc-set-trow">
      <div className="wc-set-trow-txt">
        <div className="wc-set-trow-t">{title}</div>
        {desc && <div className="wc-set-trow-d">{desc}</div>}
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

function SetCheck({ label, tone, defaultChecked }: { label: string; tone?: string; defaultChecked?: boolean }) {
  return (
    <label className="wc-set-check">
      <input type="checkbox" defaultChecked={defaultChecked !== false} style={{ accentColor: tone === "blue" ? "#5BB4E3" : "var(--accent)" }} />
      <span>{label}</span>
    </label>
  );
}

function SetRadioRow({ name, label, desc, defaultChecked }: { name: string; label: string; desc?: string; defaultChecked?: boolean }) {
  return (
    <label className="wc-set-radio">
      <input type="radio" name={name} defaultChecked={defaultChecked} style={{ accentColor: "var(--accent)" }} />
      <div className="wc-set-radio-txt">
        <div className="wc-set-radio-t">{label}</div>
        {desc && <div className="wc-set-radio-d">{desc}</div>}
      </div>
    </label>
  );
}

function KbRow({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="wc-set-kb">
      <span className="wc-set-kb-ic"><Icon name={icon} size={17} /></span>
      <span className="wc-set-kb-label">{label}</span>
      <span className="wc-set-kb-time">Updated 2 days ago</span>
      <button className="wc-set-kb-edit"><Icon name="pencil" size={15} /></button>
    </div>
  );
}

const WF_TONES: Record<string, { bg: string; fg: string }> = {
  orange: { bg: "var(--accent-soft)", fg: "var(--accent-strong)" },
  blue: { bg: "var(--blue-bg)", fg: "var(--blue)" },
  violet: { bg: "var(--violet-bg)", fg: "var(--violet)" },
  green: { bg: "var(--green-bg)", fg: "var(--green)" },
};

function NotifRow({ icon, tone, title, desc, on, onChange }: { icon: string; tone: string; title: string; desc: string; on: boolean; onChange: (n: boolean) => void }) {
  const t = WF_TONES[tone] || WF_TONES.orange;
  return (
    <div className="wc-set-notif">
      <span className="wc-set-notif-ic" style={{ background: t.bg, color: t.fg }}><Icon name={icon} size={16} /></span>
      <div className="wc-set-notif-txt">
        <div className="wc-set-notif-t">{title}</div>
        <div className="wc-set-notif-d">{desc}</div>
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

// AI Qualification checkbox label -> the real question stored in ai_qualification.
const BUYER_Q: [string, string][] = [
  ["Location", "What area are you looking to buy in?"],
  ["Price Range", "What's your budget or price range?"],
  ["Bedrooms", "How many bedrooms do you need?"],
  ["Timeline", "What's your buying timeline?"],
  ["Pre-Approved", "Are you pre-approved for a mortgage?"],
];
const SELLER_Q: [string, string][] = [
  ["Property Address", "What's the property address?"],
  ["Timeline", "What's your timeline to sell?"],
  ["Reason For Selling", "What's your reason for selling?"],
  ["Expected Price", "What price are you hoping to get?"],
  ["Already Listed", "Is the property already listed?"],
];

export function AISettings() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["ai-settings"], queryFn: () => fetchAiSettings() as Promise<{ master_enabled: boolean }>, ...AI_QUERY_OPTS });
  const aiOn = settings?.master_enabled ?? true;
  const setMaster = useMutation({ mutationFn: (next: boolean) => updateAiSettings({ master_enabled: next }), onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-settings"] }) });

  // Live inbound auto-response flags (auto_response_settings). These back the
  // mappable toggles in the Inbound AI / Outbound AI cards.
  type AR = Record<string, boolean>;
  const { data: ar } = useQuery({ queryKey: ["auto-response"], queryFn: () => fetchAutoResponse() as Promise<AR>, ...AI_QUERY_OPTS });
  const arSet = useMutation({ mutationFn: (d: Record<string, unknown>) => updateAutoResponse(d), onSuccess: () => qc.invalidateQueries({ queryKey: ["auto-response"] }) });
  const arOn = (f: string) => (ar ? Boolean(ar[f]) : true);

  // AI Brain → agent_profile. tone_preference is its own column; goals +
  // custom_instructions live in persona_json (merge so V2's keys aren't lost).
  interface Profile { tone_preference?: string | null; persona_json?: string | null }
  const { data: profile } = useQuery({ queryKey: ["agent-profile"], queryFn: () => fetchAgentProfile() as Promise<Profile>, ...AI_QUERY_OPTS });
  const persona: Record<string, unknown> = (() => { try { return profile?.persona_json ? JSON.parse(profile.persona_json) : {}; } catch { return {}; } })();
  const tone = (profile?.tone_preference as string) || "Professional";
  const goals: string[] = Array.isArray(persona.goals) ? (persona.goals as string[]) : [];
  const saveProfile = useMutation({ mutationFn: (d: Record<string, unknown>) => updateAgentProfile(d), onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-profile"] }) });
  const setTone = (t: string) => saveProfile.mutate({ tone_preference: t });
  const toggleGoal = (g: string) => { const next = goals.includes(g) ? goals.filter((x) => x !== g) : [...goals, g]; saveProfile.mutate({ persona_json: { ...persona, goals: next } }); };
  // Custom instructions: local draft, seeded from persona, saved on blur.
  const [ci, setCi] = useState("");
  const [ciSeeded, setCiSeeded] = useState(false);
  useEffect(() => { if (profile && !ciSeeded) { setCi(typeof persona.custom_instructions === "string" ? (persona.custom_instructions as string) : ""); setCiSeeded(true); } }, [profile, ciSeeded, persona]);
  const saveCi = () => saveProfile.mutate({ persona_json: { ...persona, custom_instructions: ci } });

  // AI Qualification → ai_qualification rows. Each checkbox label maps to a real
  // qualification question the AI asks; toggling creates/deletes the row.
  interface QualRow { id: number; applies_to: string; question: string; enabled: boolean }
  const { data: qualData } = useQuery({ queryKey: ["ai-qualifications"], queryFn: () => fetchAiQualifications() as Promise<{ entries: QualRow[] }>, ...AI_QUERY_OPTS });
  const quals = qualData?.entries ?? [];
  const createQual = useMutation({ mutationFn: (d: Record<string, unknown>) => createAiQualification(d), onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-qualifications"] }) });
  const deleteQual = useMutation({ mutationFn: (id: number) => deleteAiQualification(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-qualifications"] }) });
  const findQual = (leadType: string, question: string) => quals.find((q) => (q.applies_to === leadType || q.applies_to === "all") && q.question.trim().toLowerCase() === question.toLowerCase());
  const toggleQual = (leadType: string, question: string) => { const row = findQual(leadType, question); if (row) deleteQual.mutate(row.id); else createQual.mutate({ applies_to: leadType, question }); };

  // Notifications → /me/notification-settings. Only "Appointment Ready" maps to
  // a real channel toggle (notify_appointments); the other prototype rows are
  // event-types the backend doesn't model, so they stay UI-level.
  const { data: me } = useQuery({ queryKey: ["me-bootstrap"], queryFn: () => fetchMeBootstrap() as Promise<{ notification_settings?: Record<string, boolean> }>, ...AI_QUERY_OPTS });
  const notifyAppt = me?.notification_settings?.notify_appointments ?? true;
  const setNotif = useMutation({ mutationFn: (d: Record<string, boolean>) => patchNotificationSettings(d), onSuccess: () => qc.invalidateQueries({ queryKey: ["me-bootstrap"] }) });

  const [tg, setTg] = useState({
    autoReply: true, leadQual: true, apptBook: true, humanDetect: true,
    followUp: true, nurture: true, reengage: true, stopReply: true,
    nHot: true, nAppt: true, nHuman: true, nMissed: true,
  });
  const set = (k: keyof typeof tg, v: boolean) => setTg((o) => ({ ...o, [k]: v }));

  return (
    <div className="wc-v3-body wc-set">
      <div className="wc-set-head">
        <div>
          <h2 className="wc-set-h">AI Settings</h2>
          <p className="wc-set-sub">Configure how your AI assistant handles conversations and leads.</p>
        </div>
        <div className="wc-set-head-r">
          <button className="wc-set-help"><Icon name="checkCircle" size={16} />Help</button>
          <button className="wc-set-save">Save Changes</button>
        </div>
      </div>

      <div className="wc-set-status">
        <div className="wc-set-status-l">
          <div className="wc-set-status-t">AI Assistant <span className={"wc-set-pill" + (aiOn ? " is-on" : "")}>{aiOn ? "ON" : "PAUSED"}</span></div>
          <div className="wc-set-status-d">{aiOn ? "Your AI is active and ready to engage with leads." : "Your AI is paused and will not engage leads."}</div>
        </div>
        <button className="wc-set-pause" disabled={setMaster.isPending} onClick={() => setMaster.mutate(!aiOn)}><Icon name={aiOn ? "pause" : "play"} size={15} />{aiOn ? "Pause AI" : "Resume AI"}</button>
      </div>

      <div className="wc-set-grid">
        <SetCard title="Inbound AI" desc="How AI handles incoming leads">
          <div className="wc-set-split">
            <div className="wc-set-panel">
              <SetToggleRow title="Auto Reply" desc="Automatically reply to new conversations" on={arOn("inbound_sms_enabled")} onChange={(v) => arSet.mutate({ inbound_sms_enabled: v })} />
              <SetToggleRow title="Lead Qualification" desc="Ask qualifying questions and score leads" on={arOn("qualification_enabled")} onChange={(v) => arSet.mutate({ qualification_enabled: v })} />
              <SetToggleRow title="Appointment Booking" desc="Allow AI to book appointments" on={arOn("booking_handoff_enabled")} onChange={(v) => arSet.mutate({ booking_handoff_enabled: v })} />
              <SetToggleRow title="Human Takeover Detection" desc="Detect when to escalate to human" on={tg.humanDetect} onChange={(v) => set("humanDetect", v)} />
            </div>
            <div className="wc-set-side">
              <div className="wc-set-box">
                <div className="wc-set-box-t">Response Time</div>
                <SetRadioRow name="resp" label="Instant" defaultChecked />
                <SetRadioRow name="resp" label="30 Seconds" />
                <SetRadioRow name="resp" label="1 Minute" />
                <SetRadioRow name="resp" label="2 Minutes" />
              </div>
              <div className="wc-set-box">
                <div className="wc-set-box-t">Business Hours</div>
                <div className="wc-set-bh">
                  <div>
                    <div className="wc-set-bh-time">9:00 AM – 7:00 PM</div>
                    <div className="wc-set-bh-days">Mon – Sun</div>
                  </div>
                  <button className="wc-set-bh-edit"><Icon name="pencil" size={14} /></button>
                </div>
              </div>
            </div>
          </div>
        </SetCard>

        <SetCard title="Outbound AI" desc="How AI follows up with leads">
          <div className="wc-set-split">
            <div className="wc-set-panel">
              <SetToggleRow title="Follow-Up AI" desc="Automatically follow up with new leads" on={tg.followUp} onChange={(v) => set("followUp", v)} />
              <SetToggleRow title="Lead Nurture" desc="Nurture leads over time" on={tg.nurture} onChange={(v) => set("nurture", v)} />
              <SetToggleRow title="Re-engagement" desc="Re-engage inactive leads" on={tg.reengage} onChange={(v) => set("reengage", v)} />
              <SetToggleRow title="Stop On Reply" desc="Stop sequence when lead replies" on={arOn("stop_on_reply")} onChange={(v) => arSet.mutate({ stop_on_reply: v })} />
            </div>
            <div className="wc-set-side">
              <div className="wc-set-box">
                <div className="wc-set-box-t">Follow-Up Frequency</div>
                <SetRadioRow name="freq" label="Aggressive" desc="More frequent follow ups" />
                <SetRadioRow name="freq" label="Standard" desc="Recommended" defaultChecked />
                <SetRadioRow name="freq" label="Light" desc="Less frequent follow ups" />
              </div>
            </div>
          </div>
        </SetCard>

        <SetCard title="AI Qualification" desc="What AI should ask and learn">
          <div className="wc-set-split">
            <div className="wc-set-box">
              <div className="wc-set-box-t"><Icon name="file" size={15} style={{ color: "#5BB4E3" }} /> Buyer Questions</div>
              <div className="wc-set-checks">
                {BUYER_Q.map(([label, q]) => (
                  <label key={label} className="wc-set-check">
                    <input type="checkbox" checked={!!findQual("buyer", q)} onChange={() => toggleQual("buyer", q)} style={{ accentColor: "#5BB4E3" }} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="wc-set-box">
              <div className="wc-set-box-t"><Icon name="home" size={15} style={{ color: "var(--accent)" }} /> Seller Questions</div>
              <div className="wc-set-checks">
                {SELLER_Q.map(([label, q]) => (
                  <label key={label} className="wc-set-check">
                    <input type="checkbox" checked={!!findQual("seller", q)} onChange={() => toggleQual("seller", q)} style={{ accentColor: "var(--accent)" }} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </SetCard>

        <SetCard title="Appointment Rules" desc="When AI should book appointments">
          <div className="wc-set-split">
            <div className="wc-set-box">
              <div className="wc-set-box-t">Book Appointment When:</div>
              <div className="wc-set-checks">
                {["Lead is qualified", "Lead asks to tour", "Lead requests pricing", "Lead requests consultation"].map((q) => <SetCheck key={q} label={q} />)}
              </div>
            </div>
            <div className="wc-set-box">
              <div className="wc-set-box-t">Calendar Connected</div>
              <div className="wc-set-cal">
                <span className="wc-set-cal-ic"><Icon name="calendar" size={18} style={{ color: "#fff" }} /></span>
                <div className="wc-set-cal-txt">
                  <div className="wc-set-cal-name">Google Calendar</div>
                  <div className="wc-set-cal-status"><Icon name="check" size={12} />Connected</div>
                </div>
                <button className="wc-set-cal-more"><Icon name="more" size={16} /></button>
              </div>
              <button className="wc-set-editq">Manage Calendars</button>
            </div>
          </div>
        </SetCard>

        <SetCard title="Human Takeover" desc="When AI should notify you or transfer">
          <div className="wc-set-checks wc-set-checks-2">
            {["Lead requests human", "AI confidence is low", "Lead asks a legal question", "Contract or agreement questions", "Lead becomes frustrated", "Urgent or sensitive issues"].map((q) => <SetCheck key={q} label={q} />)}
          </div>
          <div className="wc-set-box" style={{ marginTop: 16 }}>
            <div className="wc-set-box-t">Notification Method</div>
            <div className="wc-set-select">In-App + Email <Icon name="chevronDown" size={14} /></div>
          </div>
        </SetCard>

        <SetCard title="Notifications" desc="Alerts and updates about important events">
          <div className="wc-set-notifs">
            <NotifRow icon="flame" tone="violet" title="Hot Lead Alert" desc="Notify when a lead shows high intent" on={tg.nHot} onChange={(v) => set("nHot", v)} />
            <NotifRow icon="calendarCheck" tone="green" title="Appointment Ready" desc="Notify when an appointment is booked" on={notifyAppt} onChange={(v) => setNotif.mutate({ notify_appointments: v })} />
            <NotifRow icon="user" tone="orange" title="Human Takeover Required" desc="Notify when AI needs your attention" on={tg.nHuman} onChange={(v) => set("nHuman", v)} />
            <NotifRow icon="alert" tone="blue" title="Missed Appointment" desc="Notify when appointment is missed or cancelled" on={tg.nMissed} onChange={(v) => set("nMissed", v)} />
          </div>
        </SetCard>

        <SetCard title="AI Brain" desc="Personality, tone and behavior">
          <div className="wc-set-brain">
            <div className="wc-set-box">
              <div className="wc-set-box-t">Tone</div>
              {["Professional", "Friendly", "Casual"].map((t) => (
                <label key={t} className="wc-set-radio">
                  <input type="radio" name="v3tone" checked={tone === t} onChange={() => setTone(t)} style={{ accentColor: "var(--accent)" }} />
                  <div className="wc-set-radio-txt"><div className="wc-set-radio-t">{t}</div></div>
                </label>
              ))}
            </div>
            <div className="wc-set-box">
              <div className="wc-set-box-t">Goals</div>
              <div className="wc-set-checks">
                {["Qualify Leads", "Book Appointments", "Nurture Relationships", "Close Deals"].map((g) => (
                  <label key={g} className="wc-set-check">
                    <input type="checkbox" checked={goals.includes(g)} onChange={() => toggleGoal(g)} style={{ accentColor: "var(--accent)" }} />
                    <span>{g}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="wc-set-box wc-set-instr">
              <div className="wc-set-box-t">Custom Instructions</div>
              <textarea className="wc-set-ta" maxLength={500} value={ci} onChange={(e) => setCi(e.target.value)} onBlur={saveCi} placeholder="e.g. Keep messages short and friendly; escalate contract questions to me." />
              <div className="wc-set-ta-count">{ci.length}/500</div>
            </div>
          </div>
        </SetCard>

        <SetCard title="Knowledge Base" desc="Information AI uses to answer questions">
          <div className="wc-set-kbs">
            <KbRow icon="user" label="Agent Bio" />
            <KbRow icon="pin" label="Service Areas" />
            <KbRow icon="building" label="Office Information" />
            <KbRow icon="file" label="FAQ" />
            <KbRow icon="clipboard" label="Custom Documents" />
          </div>
        </SetCard>
      </div>
    </div>
  );
}
