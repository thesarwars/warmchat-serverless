import { Icon } from "./Icon";
import { Wcv2Portal } from "./Portal";

/* "How it works" marketing modal for the AI Command Center banner. Pure
   showcase (illustrative sample conversation - not live data): selling points
   on the left, an animated mobile-style chat on the right that walks a buyer
   from first contact through qualification, a listing photo over MMS, and a
   booked showing. Images live in public/sample-homes. */

interface Feat { icon: string; title: string; desc: string }
const FEATURES: Feat[] = [
  { icon: "zap", title: "Replies in seconds, 24/7", desc: "Every new lead gets an instant, on-brand response - day or night." },
  { icon: "message", title: "Qualifies one question at a time", desc: "Buyer or seller, budget, area, timeline, financing - captured naturally." },
  { icon: "home", title: "Matches buyers to your listings", desc: "Pulls from your inventory and can text photos over MMS." },
  { icon: "calendarCheck", title: "Books against your real calendar", desc: "Offers only open slots and holds the time for you to confirm." },
  { icon: "layers", title: "Updates your CRM, deals + tasks", desc: "Writes captured details back and moves the pipeline automatically." },
  { icon: "flame", title: "Escalates hot leads to you", desc: "Pricing, legal, or ready-to-transact moments get handed off fast." },
  { icon: "checkCircle", title: "Safe by default", desc: "Never invents facts, follows Fair Housing, and respects opt-outs." },
];

interface Msg { from: "lead" | "ai"; text?: string; image?: string; caption?: string }
const CONVO: Msg[] = [
  { from: "lead", text: "Hi! Saw your listing online - is the place on Oak St still available?" },
  { from: "ai", text: "Hi Sarah! Yes it is. Are you hoping to buy in the next few months, or just exploring?" },
  { from: "lead", text: "Looking to buy within 60 days, around $500k." },
  { from: "ai", text: "Perfect - that range works well around here. Want me to send a couple that fit?" },
  { from: "lead", text: "Yes please!" },
  { from: "ai", image: "/sample-homes/home-1.jpg", caption: "Here's one at $489k - 3 bed, 2 bath, tons of natural light." },
  { from: "ai", text: "Want to see it in person? I have Thursday at 2pm or Friday at 11am open." },
  { from: "lead", text: "Thursday works!" },
  { from: "ai", text: "Great - I'll hold Thursday 2pm and your agent will confirm shortly. Talk soon!" },
];

function Bubble({ m, i }: { m: Msg; i: number }) {
  const ai = m.from === "ai";
  const style = { animation: "fadeUp .45s both", animationDelay: `${0.25 + i * 0.45}s` } as React.CSSProperties;
  return (
    <div style={{ display: "flex", justifyContent: ai ? "flex-end" : "flex-start", ...style }}>
      <div style={{
        maxWidth: "82%", borderRadius: 16, padding: m.image ? 5 : "8px 11px", fontSize: 12.5, lineHeight: 1.45,
        background: ai ? "var(--accent)" : "#fff", color: ai ? "#fff" : "var(--ink)",
        border: ai ? "none" : "1px solid var(--line)",
        borderBottomRightRadius: ai ? 5 : 16, borderBottomLeftRadius: ai ? 16 : 5,
        boxShadow: "0 1px 2px rgba(0,0,0,.05)",
      }}>
        {m.image && <img src={m.image} alt="Listing" style={{ width: "100%", borderRadius: 12, display: "block", marginBottom: m.caption ? 6 : 0 }} />}
        {m.caption && <div style={{ padding: "0 6px 4px" }}>{m.caption}</div>}
        {m.text && <span>{m.text}</span>}
      </div>
    </div>
  );
}

export function HowItWorksModal({ onClose }: { onClose: () => void }) {
  return (
    <Wcv2Portal>
      <div className="wc-modal-scrim" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} style={{
          width: "min(1000px, 94vw)", maxHeight: "92vh", overflow: "hidden", background: "var(--panel)",
          borderRadius: 20, boxShadow: "var(--shadow-lg)", margin: "auto", display: "flex", flexDirection: "column",
          animation: "wcpop .28s both",
        }}>
          <button className="wc-modal-x" onClick={onClose}><Icon name="x" size={18} /></button>

          <div style={{ display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 0, overflow: "hidden", minHeight: 0 }}>
            {/* Left: pitch + features */}
            <div style={{ padding: "28px 26px", overflowY: "auto" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: "var(--accent-strong)", background: "var(--accent-soft)", padding: "5px 11px", borderRadius: 99, marginBottom: 14 }}>
                <Icon name="sparkles" size={14} />Your always-on agent
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.15, margin: "0 0 8px" }}>Turn every lead into a conversation - automatically</h2>
              <p style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5, margin: "0 0 18px" }}>Your AI works leads like your best agent would: it replies instantly, qualifies, matches listings, sends photos, and books showings - then hands the hot ones to you.</p>
              <div style={{ display: "grid", gap: 12 }}>
                {FEATURES.map((f, i) => (
                  <div key={f.title} style={{ display: "flex", gap: 11, alignItems: "flex-start", animation: "fadeUp .4s both", animationDelay: `${0.05 + i * 0.06}s` }}>
                    <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", color: "var(--accent-strong)", background: "var(--accent-soft)" }}><Icon name={f.icon} size={15} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{f.title}</div>
                      <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.4 }}>{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 22 }}>
                <button className="wc-primary" onClick={onClose}><Icon name="check" size={16} />Got it - let's go</button>
              </div>
            </div>

            {/* Right: animated mobile chat showcase */}
            <div style={{ background: "linear-gradient(160deg, var(--accent-soft), var(--line-soft))", padding: "24px 0", display: "grid", placeItems: "center", overflow: "hidden" }}>
              <div style={{ width: 340, maxHeight: "70vh", border: "8px solid #1F2430", borderRadius: 30, background: "#F3F4F6", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 18px 40px rgba(20,24,40,.28)" }}>
                <div style={{ background: "var(--panel)", padding: "12px 14px", display: "flex", alignItems: "center", gap: 9, borderBottom: "1px solid var(--line)" }}>
                  <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "grid", placeItems: "center", flex: "none" }}><Icon name="bot" size={16} /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>Your AI agent</div>
                    <div style={{ fontSize: 10.5, color: "#16A34A", fontWeight: 600 }}>Active now</div>
                  </div>
                </div>
                <div style={{ flex: 1, scrollbarWidth: "thin", overflowY: "auto", padding: "12px 10px", display: "grid", gap: 8, background: "#ECEEF1" }}>
                  {CONVO.map((m, i) => <Bubble key={i} m={m} i={i} />)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Wcv2Portal>
  );
}
