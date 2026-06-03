import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/MainLayout";
import { Icon } from "@/components/ai-v2/Icon";
import { TONES } from "@/components/ai-v2/tones";
import { fetchOrgDeals, createDeal, updateDeal, deleteDeal, fetchOrgLeads, fetchOrgMembers } from "@/helpers/backend";
import { ListingsManager } from "@/components/listings/ListingsManager";
import { Wcv2Portal } from "@/components/ai-v2/Portal";
import { useRole } from "@/hooks/useRole";
import "@/components/ai-v2/prototype.css";

/* Deals - Buyer / Seller / Renter / Renter-Listing pipelines, ported from the
   "leads-remix-2" design bundle (deals.jsx) and wired to the real /api/deals
   backend. The kanban renders live deals by stage, drag-to-move persists
   (PATCH /deals/:id), the KPI strip is real, and "Add Deal" creates a deal
   (POST /deals): a lead is OPTIONAL, anyone can attach one, and brokers
   (Owner/Manager) can assign team members. */

interface Stage { key: string; name: string; color: string }
const STAGE_SETS: Record<string, Stage[]> = {
  Buyer: [
    { key: "consult", name: "Buyer Consultation", color: "#F59E0B" },
    { key: "search", name: "Home Search", color: "#3B82F6" },
    { key: "tours", name: "Property Tours", color: "#8B5CF6" },
    { key: "writing", name: "Offer Writing", color: "#6366F1" },
    { key: "submitted", name: "Offer Submitted", color: "#0EA5E9" },
    { key: "contract", name: "Under Contract", color: "#14B8A6" },
    { key: "escrow", name: "Escrow", color: "#F97316" },
    { key: "closed", name: "Closed Won", color: "#22C55E" },
  ],
  Seller: [
    { key: "consult", name: "Listing Consultation", color: "#F59E0B" },
    { key: "signed", name: "Agreement Signed", color: "#3B82F6" },
    { key: "prepping", name: "Prepping Property", color: "#8B5CF6" },
    { key: "active", name: "Active Listing", color: "#6366F1" },
    { key: "received", name: "Offer Received", color: "#0EA5E9" },
    { key: "contract", name: "Under Contract", color: "#14B8A6" },
    { key: "escrow", name: "Escrow", color: "#F97316" },
    { key: "closed", name: "Closed Won", color: "#22C55E" },
  ],
  Renter: [
    { key: "consult", name: "Renter Consultation", color: "#F59E0B" },
    { key: "search", name: "Property Search", color: "#3B82F6" },
    { key: "showings", name: "Showings", color: "#8B5CF6" },
    { key: "application", name: "Application Submitted", color: "#6366F1" },
    { key: "screening", name: "Screening", color: "#0EA5E9" },
    { key: "approved", name: "Approved", color: "#14B8A6" },
    { key: "lease", name: "Lease Signed", color: "#F97316" },
    { key: "closed", name: "Moved In", color: "#22C55E" },
  ],
};

interface TypeMeta { icon: string; chip: string; monthly: boolean; rate: number; feeLabel: string }
const TYPE_META: Record<string, TypeMeta> = {
  Buyer: { icon: "home", chip: "wc-chip-buyer", monthly: false, rate: 0.025, feeLabel: "Est. commission" },
  Seller: { icon: "building2", chip: "wc-chip-seller", monthly: false, rate: 0.025, feeLabel: "Est. commission" },
  Renter: { icon: "home", chip: "wc-chip-renter", monthly: true, rate: 1, feeLabel: "Est. fee (1 mo.)" },
};

// Mirror MAX_DEALS_PER_ORG in functions/_shared/deals.ts.
const MAX_DEALS = 5000;
const fmt$ = (n: number) => "$" + n.toLocaleString("en-US");
const fmtK = (n: number) => (n >= 1000 ? "$" + (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "K" : "$" + n);

interface Deal {
  id: number;
  lead_id: number | null;
  name: string;
  type: string;
  price: number;
  stage: string;
  task: string;
  comm: number;
  agent: string;
  agentInit: string;
  ai: string | null;
  // Carried for the edit modal.
  commissionRaw: number | null;
  closeDate: string | null;
  description: string | null;
  assignees: { id: number; name: string }[];
}
interface NewDeal {
  name: string; leadId: number | null; type: string; stage: string; price: number;
  commission: number | null; closeDate: string | null; description: string | null; assigneeIds: number[];
}

interface ApiDeal {
  id: number; lead_id: number | null; name: string; lead_type: string | null;
  stage: string | null; value: number | null; commission: number | null;
  close_date: string | null; description: string | null;
  status: string; agent: string; assignees?: { id: number; name: string }[];
}
interface DealSummary { total: number; open: number; won: number; pipeline_value: number; won_value: number }

// Map a lead_type / deal_type to one of the four pipeline tabs. Unknown -> Buyer.
const TYPE_FROM_LEAD: Record<string, string> = {
  buyer: "Buyer", seller: "Seller", renter: "Renter",
};
const dealType = (leadType: string | null): string => TYPE_FROM_LEAD[(leadType || "").toLowerCase()] || "Buyer";
// The pipeline tab -> the canonical deal_type stored on the deal row.
const TYPE_TO_KEY: Record<string, string> = {
  Buyer: "buyer", Seller: "seller", Renter: "renter",
};
// A real deal.stage is free text; bucket anything we don't recognise into the
// first column of its pipeline so every deal still renders.
const validStage = (type: string, stage: string | null): string => {
  const set = STAGE_SETS[type] || [];
  return set.some((s) => s.key === stage) ? (stage as string) : (set[0]?.key || "consult");
};
const initials = (n: string) => n.split(" ").map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();
const apiToDeal = (d: ApiDeal): Deal => {
  const type = dealType(d.lead_type);
  const value = d.value || 0;
  // Real commission when set, otherwise the type-based estimate.
  const comm = d.commission != null ? d.commission : Math.round(value * TYPE_META[type].rate);
  return {
    id: d.id, lead_id: d.lead_id, name: d.name, type,
    price: value, stage: validStage(type, d.stage), task: "",
    comm,
    agent: d.agent || "", agentInit: d.agent ? initials(d.agent) : "",
    ai: null,
    commissionRaw: d.commission, closeDate: d.close_date, description: d.description,
    assignees: d.assignees ?? [],
  };
};

const stageName = (type: string, key: string) => (STAGE_SETS[type] || []).find((s) => s.key === key)?.name || key;

function DealCard({ deal, onMove, onDragStart, onEdit, onDelete }: { deal: Deal; onMove: (d: Deal, stage: string) => void; onDragStart: (d: Deal) => void; onEdit: (d: Deal) => void; onDelete: (d: Deal) => void }) {
  const meta = TYPE_META[deal.type];
  const priceTxt = meta.monthly ? fmt$(deal.price) + "/mo" : fmt$(deal.price);
  // Click opens the edit modal; drag still moves the card (HTML5 drag does not
  // fire a trailing click). The AI-suggest + delete buttons stop propagation.
  return (
    <div className="wc-card wc-dcard" style={{ cursor: "pointer", position: "relative", paddingBottom: 30 }} draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(deal); }}
      onClick={() => onEdit(deal)}>
      <button title="Delete deal" onClick={(e) => { e.stopPropagation(); onDelete(deal); }}
        style={{ position: "absolute", right: 8, bottom: 8, width: 24, height: 24, borderRadius: 6, display: "grid", placeItems: "center", color: "#DC2626", background: "transparent" }}>
        <Icon name="trash" size={14} />
      </button>
      <div className="wc-dcard-top">
        <div className="wc-dcard-name">{deal.name}</div>
        <span className={"wc-chip " + meta.chip}><Icon name={meta.icon} size={11} />{deal.type}</span>
      </div>
      <div className="wc-dprice wc-mono">{priceTxt}</div>
      <div className="wc-dcomm"><Icon name="dollar" size={12} />{meta.feeLabel} <strong className="wc-mono">{fmt$(deal.comm)}</strong></div>
      {deal.description && <div style={{ fontSize: 12.5, color: "var(--ink-2)", margin: "6px 0", lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{deal.description}</div>}
      {deal.agent && <span className="wc-dagent"><span className="wc-dagent-av">{deal.agentInit}</span>{deal.agent}</span>}
      {deal.task && <div className="wc-dtask"><Icon name="calendarCheck" size={13} /><span>{deal.task}</span></div>}
      {deal.ai && (
        <button className="wc-aimove" onClick={(e) => { e.stopPropagation(); onMove(deal, deal.ai as string); }}>
          <Icon name="sparkles" size={13} />
          <span>AI suggests &rarr; <strong>{stageName(deal.type, deal.ai)}</strong></span>
          <span className="wc-aimove-go"><Icon name="check" size={13} /></span>
        </button>
      )}
    </div>
  );
}

const DEALS_PAGE = 20;

function DealColumn({ stage, deals, onMove, onAdd, onEdit, onDelete, onDragStart, isOver, onOver, onLeave, onDrop }: {
  stage: Stage; deals: Deal[]; onMove: (d: Deal, stage: string) => void; onAdd: (k: string) => void; onEdit: (d: Deal) => void; onDelete: (d: Deal) => void;
  onDragStart: (d: Deal) => void; isOver: boolean; onOver: () => void; onLeave: () => void; onDrop: () => void;
}) {
  const total = deals.reduce((s, d) => s + d.comm, 0);
  // Lazy render: show 20 at a time, load more on demand.
  const [shown, setShown] = useState(DEALS_PAGE);
  const visible = deals.slice(0, shown);
  return (
    <div className={"wc-col wc-dcol" + (isOver ? " is-over" : "")} style={{ borderTop: "3px solid " + stage.color }}
      onDragOver={(e) => { e.preventDefault(); onOver(); }} onDragLeave={onLeave} onDrop={(e) => { e.preventDefault(); onDrop(); }}>
      <div className="wc-dhead">
        <div className="wc-dhead-title">{stage.name}</div>
        <div className="wc-dhead-meta">
          <span>{deals.length} {deals.length === 1 ? "deal" : "deals"}</span>
          <span className="wc-dhead-val wc-mono">{fmtK(total)}</span>
          <button className="wc-dadd" title="Add deal" onClick={() => onAdd(stage.key)}><Icon name="plus" size={14} /></button>
        </div>
      </div>
      <div className="wc-col-body">
        {visible.map((d) => <DealCard key={d.id} deal={d} onMove={onMove} onDragStart={onDragStart} onEdit={onEdit} onDelete={onDelete} />)}
        {deals.length > shown && (
          <button className="wc-dempty" onClick={() => setShown((s) => s + DEALS_PAGE)}>Load more <span>({deals.length - shown})</span></button>
        )}
        {deals.length === 0 && <button className="wc-dempty" onClick={() => onAdd(stage.key)}>No deals · <span>add deal</span></button>}
      </div>
    </div>
  );
}

function DealBoard({ type, deals, onMove, onAdd, onEdit, onDelete }: { type: string; deals: Deal[]; onMove: (d: Deal, stage: string) => void; onAdd: (type: string, stage: string) => void; onEdit: (d: Deal) => void; onDelete: (d: Deal) => void }) {
  const stages = STAGE_SETS[type];
  const [drag, setDrag] = useState<Deal | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Click-and-drag panning: grab the board background (mouse) to scroll the
  // columns left/right. Touch already pans natively via overflow-x:auto, so we
  // only hijack the mouse and leave touch to the browser's momentum scroll.
  const pan = useRef({ active: false, startX: 0, startScroll: 0 });
  const [grabbing, setGrabbing] = useState(false);
  const onPanDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    // Don't start a pan on a card or any interactive control - those have their
    // own drag/click behaviour.
    if ((e.target as HTMLElement).closest(".wc-dcard, button, input, select, textarea, a")) return;
    const el = boardRef.current;
    if (!el) return;
    pan.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft };
    el.setPointerCapture(e.pointerId);
    setGrabbing(true);
  };
  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pan.current.active || !boardRef.current) return;
    boardRef.current.scrollLeft = pan.current.startScroll - (e.clientX - pan.current.startX);
  };
  const endPan = () => { if (pan.current.active) { pan.current.active = false; setGrabbing(false); } };

  // Auto-scroll the board horizontally while a card is being dragged near an
  // edge, so you can move a deal to an off-screen column.
  const auto = useRef({ raf: 0, vx: 0 });
  const stopAuto = () => {
    if (auto.current.raf) cancelAnimationFrame(auto.current.raf);
    auto.current = { raf: 0, vx: 0 };
  };
  const tick = () => {
    const el = boardRef.current;
    if (el && auto.current.vx) { el.scrollLeft += auto.current.vx; auto.current.raf = requestAnimationFrame(tick); }
    else auto.current.raf = 0;
  };
  const onBoardDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const el = boardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const EDGE = 90, MAX = 20; // px-wide hot zone, max px/frame
    const fromLeft = e.clientX - r.left;
    const fromRight = r.right - e.clientX;
    let vx = 0;
    if (fromLeft < EDGE) vx = -Math.ceil(((EDGE - fromLeft) / EDGE) * MAX);
    else if (fromRight < EDGE) vx = Math.ceil(((EDGE - fromRight) / EDGE) * MAX);
    auto.current.vx = vx;
    if (vx && !auto.current.raf) auto.current.raf = requestAnimationFrame(tick);
    else if (!vx) stopAuto();
  };

  return (
    <div ref={boardRef} className={"wc-board wc-board-pan" + (grabbing ? " is-grabbing" : "")}
      onPointerDown={onPanDown} onPointerMove={onPanMove} onPointerUp={endPan} onPointerCancel={endPan}
      onDragOver={onBoardDragOver} onDrop={stopAuto}>
      {stages.map((s) => (
        <DealColumn key={s.key} stage={s} deals={deals.filter((d) => d.type === type && d.stage === s.key)}
          onMove={onMove} onAdd={(k) => onAdd(type, k)} onEdit={onEdit} onDelete={onDelete}
          onDragStart={setDrag} isOver={over === s.key}
          onOver={() => setOver(s.key)} onLeave={() => setOver((o) => (o === s.key ? null : o))}
          onDrop={() => { stopAuto(); if (drag && drag.stage !== s.key) onMove(drag, s.key); setDrag(null); setOver(null); }} />
      ))}
    </div>
  );
}

interface Member { id: number; name: string }

// Round avatar with initials. Team members use the accent colour (like the
// design's "JV" chip); a linked lead uses a neutral grey.
function Avatar({ name, accent }: { name: string; accent?: boolean }) {
  return (
    <span style={{
      width: 30, height: 30, borderRadius: "50%", flex: "none",
      display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700,
      background: accent ? "var(--accent)" : "#EEECE8", color: accent ? "#fff" : "#9A938A",
    }}>{initials(name) || "?"}</span>
  );
}

const removeBtnStyle: React.CSSProperties = {
  width: 16, height: 16, borderRadius: "50%", display: "grid", placeItems: "center",
  background: "var(--line-soft)", color: "var(--ink-3)", flex: "none",
};

interface EditInit {
  name: string; stage: string; price: number;
  commission: number | null; closeDate: string | null; description: string | null;
  leadId: number | null; leadName: string | null; assignees: Member[];
}

// Listing-type deals are about a PROPERTY (the agent lists it), so the primary
// field is the address; buyer/renter deals are about a person/deal name.
const isListingType = (type: string) => type === "Seller";

function AddDealModal({ type, stage, leads, members, currentUser, isBroker, initial, onClose, onCreate }: {
  type: string; stage: string; leads: Member[]; members: Member[];
  currentUser: Member; isBroker: boolean; initial?: EditInit | null;
  onClose: () => void; onCreate: (d: NewDeal) => void;
}) {
  const meta = TYPE_META[type];
  const stages = STAGE_SETS[type];
  const [name, setName] = useState(initial?.name ?? "");
  const [stageKey, setStageKey] = useState(initial?.stage ?? stage);
  const [price, setPrice] = useState(initial && initial.price ? String(initial.price) : "");
  const [lead, setLead] = useState<Member | null>(initial?.leadId ? { id: initial.leadId, name: initial.leadName || "Lead" } : null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [team, setTeam] = useState<Member[]>(initial ? initial.assignees.filter((a) => a.id !== currentUser.id) : []);
  const [teamOpen, setTeamOpen] = useState(false);
  const [showClose, setShowClose] = useState(Boolean(initial?.closeDate));
  const [closeDate, setCloseDate] = useState(initial?.closeDate ?? "");
  const [showComm, setShowComm] = useState(initial?.commission != null);
  const [comm, setComm] = useState(initial?.commission != null ? String(initial.commission) : "");
  const [showDesc, setShowDesc] = useState(true); // description expanded by default
  const [desc, setDesc] = useState(initial?.description ?? "");

  // Only dismiss when the press STARTED on the scrim - otherwise selecting text
  // in an input and releasing over the overlay would close the modal.
  const downOnScrim = useRef(false);

  const listing = isListingType(type);
  const nameLabel = listing ? "Property address" : "Deal name";
  const st = stages.find((s) => s.key === stageKey) || stages[0];
  const can = name.trim() !== "" || lead !== null;
  const teamPool = members.filter((m) => m.id !== currentUser.id && !team.some((t) => t.id === m.id));

  const submit = () => {
    if (!can) return;
    onCreate({
      name: name.trim() || (lead ? lead.name : ""),
      leadId: lead?.id ?? null,
      type, stage: stageKey,
      price: Number(price) || 0,
      commission: showComm && comm !== "" ? Number(comm) : null,
      closeDate: showClose && closeDate ? closeDate : null,
      description: showDesc && desc.trim() ? desc.trim() : null,
      assigneeIds: team.map((m) => m.id),
    });
  };

  return (
    <Wcv2Portal>
    <div className="wc-modal-scrim"
      onMouseDown={(e) => { downOnScrim.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (e.target === e.currentTarget && downOnScrim.current) onClose(); }}>
      <div className="wc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
        <button className="wc-modal-x" onClick={onClose}><Icon name="x" size={18} /></button>
        <div className="wc-modal-lbl" style={{ marginBottom: 4 }}>{nameLabel}{listing ? " (the listing)" : ""}</div>
        <input className="wc-modal-title" placeholder={listing ? "123 Oak St" : "Deal name"} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <div className="wc-modal-crumb">
          <span className="wc-crumb-tag">#{type}</span>
          <Icon name="chevronRight" size={12} />
          <span className="wc-crumb-stage"><span className="wc-col-dot" style={{ "--stage": st.color } as React.CSSProperties} />{st.name}</span>
        </div>

        <div className="wc-modal-grid">
          {/* PRICE */}
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">{meta.monthly ? "Monthly rent" : "Price"}</div>
            <input className="wc-modal-input wc-mono" type="number" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          {/* CLOSE DATE */}
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Close date</div>
            {showClose
              ? <input className="wc-modal-input" type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
              : <button className="wc-modal-link" onClick={() => setShowClose(true)}>Add close date</button>}
          </div>
          {/* COMMISSION */}
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Commission</div>
            {showComm
              ? <input className="wc-modal-input wc-mono" type="number" placeholder="0" value={comm} onChange={(e) => setComm(e.target.value)} />
              : <button className="wc-modal-link" onClick={() => setShowComm(true)}>Add commission</button>}
          </div>
          {/* STAGE */}
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Stage</div>
            <select className="wc-modal-input wc-modal-select" value={stageKey} onChange={(e) => setStageKey(e.target.value)}>
              {stages.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          </div>
          {/* PEOPLE - attach a lead (optional; anyone) */}
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">People</div>
            <div className="wc-modal-team">
              {lead && (
                <span className="wc-modal-team" style={{ gap: 6 }} title={lead.name}>
                  <Avatar name={lead.name} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{lead.name}</span>
                  <button style={removeBtnStyle} title="Remove lead" onClick={() => setLead(null)}><Icon name="x" size={11} /></button>
                </span>
              )}
              {!lead && (leadOpen
                ? <select className="wc-modal-input wc-modal-select" autoFocus style={{ width: 210 }} value=""
                    onChange={(e) => { const m = leads.find((l) => l.id === Number(e.target.value)) || null; setLead(m); setLeadOpen(false); }}
                    onBlur={() => setLeadOpen(false)}>
                    <option value="">Select a lead...</option>
                    {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                : <button className="wc-addcirc" title="Attach a lead" onClick={() => setLeadOpen(true)}><Icon name="plus" size={16} /></button>)}
            </div>
          </div>
          {/* TEAM - assign team members (brokers only) */}
          <div className="wc-modal-field">
            <div className="wc-modal-lbl">Team</div>
            <div className="wc-modal-team">
              <span title={`${currentUser.name || "You"} (you)`}><Avatar name={currentUser.name || "You"} accent /></span>
              {team.map((m) => (
                <span className="wc-modal-team" style={{ gap: 4 }} key={m.id} title={m.name}>
                  <Avatar name={m.name} accent />
                  <button style={removeBtnStyle} title="Remove" onClick={() => setTeam((t) => t.filter((x) => x.id !== m.id))}><Icon name="x" size={11} /></button>
                </span>
              ))}
              {isBroker && (teamOpen
                ? <select className="wc-modal-input wc-modal-select" autoFocus style={{ width: 190 }} value=""
                    onChange={(e) => { const m = members.find((x) => x.id === Number(e.target.value)); if (m) setTeam((t) => [...t, m]); setTeamOpen(false); }}
                    onBlur={() => setTeamOpen(false)}>
                    <option value="">Add member...</option>
                    {teamPool.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                : isBroker && teamPool.length > 0 && <button className="wc-addcirc" title="Assign team member" onClick={() => setTeamOpen(true)}><Icon name="plus" size={16} /></button>)}
            </div>
          </div>
        </div>

        {/* DESCRIPTION */}
        <div className="wc-modal-fieldfull">
          <div className="wc-modal-lbl">Description</div>
          {showDesc
            ? <textarea className="wc-modal-textarea" placeholder="Notes about this deal..." value={desc} onChange={(e) => setDesc(e.target.value)} />
            : <button className="wc-modal-link" onClick={() => setShowDesc(true)}>Add description</button>}
        </div>

        <div className="wc-modal-foot">
          <button className="wc-ghostbtn" onClick={onClose}>Cancel</button>
          <button className="wc-primary" disabled={!can} onClick={submit}>{initial ? "Save deal" : "Create Deal"}</button>
        </div>
      </div>
    </div>
    </Wcv2Portal>
  );
}

interface LeadOpt { id: number; name: string; lead_type: string | null }

function DealsInner() {
  const orgId = localStorage.getItem("org_id") || "";
  const qc = useQueryClient();
  const [tab, setTab] = useState("Seller");
  const [addOpen, setAddOpen] = useState<{ type: string; stage: string } | null>(null);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [confirmDel, setConfirmDel] = useState<Deal | null>(null);

  // Pipeline vs Listings view, persisted in the URL (?view=listings).
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "listings" ? "listings" : "pipeline";
  const setView = (v: "pipeline" | "listings") => {
    const p = new URLSearchParams(params);
    if (v === "pipeline") p.delete("view"); else p.set("view", v);
    setParams(p);
  };

  const { data } = useQuery({
    queryKey: ["org-deals", orgId],
    queryFn: () => fetchOrgDeals(orgId) as Promise<{ deals: ApiDeal[]; summary: DealSummary }>,
    enabled: Boolean(orgId),
  });
  const deals: Deal[] = (data?.deals ?? []).map(apiToDeal);
  const summary = data?.summary;

  // Leads for the Add-deal picker (the list endpoint returns a plain array).
  const { data: leadsRaw } = useQuery({
    queryKey: ["org-leads-min", orgId],
    queryFn: () => fetchOrgLeads(orgId) as Promise<Array<{ id: number; name?: string | null; first_name?: string | null; last_name?: string | null; lead_type?: string | null }>>,
    enabled: Boolean(orgId),
  });
  const dealLeadIds = new Set(deals.map((d) => d.lead_id));
  const leadOpts: LeadOpt[] = (Array.isArray(leadsRaw) ? leadsRaw : []).map((l) => ({
    id: l.id,
    name: (l.name || [l.first_name, l.last_name].filter(Boolean).join(" ")).trim() || "Unnamed lead",
    lead_type: l.lead_type ?? null,
  }));

  // Team members (for the TEAM picker) + the caller's identity/role. Only
  // brokers (Owner/Manager) may assign team members; everyone can attach a lead.
  const { isAdmin, isManager } = useRole();
  const isBroker = isAdmin || isManager;
  const currentUser: Member = {
    id: Number(localStorage.getItem("user_id")) || 0,
    name: localStorage.getItem("name") || "You",
  };
  const { data: membersRaw } = useQuery({
    queryKey: ["org-members"],
    queryFn: () => fetchOrgMembers() as Promise<{ users: Array<{ id: number; name: string | null; email: string }> }>,
    enabled: isBroker,
  });
  const members: Member[] = (membersRaw?.users ?? []).map((u) => ({ id: u.id, name: (u.name || u.email || "Member").trim() }));

  const leadNameById = new Map(leadOpts.map((l) => [l.id, l.name]));

  const refresh = () => qc.invalidateQueries({ queryKey: ["org-deals", orgId] });
  const moveMut = useMutation({ mutationFn: (v: { id: number; stage: string }) => updateDeal(v.id, { stage: v.stage }), onSuccess: () => refresh() });
  const createMut = useMutation({
    mutationFn: (d: NewDeal) => createDeal({
      name: d.name, lead_id: d.leadId, deal_type: TYPE_TO_KEY[d.type], stage: d.stage, value: d.price,
      commission: d.commission, close_date: d.closeDate, description: d.description, assignee_ids: d.assigneeIds,
    }),
    onSuccess: () => { refresh(); setAddOpen(null); },
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: number; d: NewDeal }) => updateDeal(v.id, {
      name: v.d.name, deal_type: TYPE_TO_KEY[v.d.type], stage: v.d.stage, value: v.d.price,
      commission: v.d.commission, close_date: v.d.closeDate, description: v.d.description,
      // include the editor so the deal keeps an owner; backend gates this to brokers.
      assignee_ids: [currentUser.id, ...v.d.assigneeIds],
    }),
    onSuccess: () => { refresh(); setEditDeal(null); },
  });
  const deleteMut = useMutation({ mutationFn: (id: number) => deleteDeal(id), onSuccess: () => { refresh(); setConfirmDel(null); } });

  // Build the edit modal's initial values from the clicked deal.
  const editInit: EditInit | null = editDeal ? {
    name: editDeal.name, stage: editDeal.stage, price: editDeal.price,
    commission: editDeal.commissionRaw, closeDate: editDeal.closeDate, description: editDeal.description,
    leadId: editDeal.lead_id,
    leadName: editDeal.lead_id != null ? (leadNameById.get(editDeal.lead_id) ?? editDeal.name) : null,
    assignees: editDeal.assignees,
  } : null;

  const onMove = (deal: Deal, toStage: string) => { if (deal.id && deal.stage !== toStage) moveMut.mutate({ id: deal.id, stage: toStage }); };
  const onAdd = (type: string, stage: string) => setAddOpen({ type, stage });

  // KPI strip from real data.
  const underContract = deals.filter((d) => d.stage === "contract" || d.stage === "escrow").length;
  const kpis = [
    { icon: "dollar", label: "Pipeline Value", value: fmtK(summary?.pipeline_value ?? 0), delta: "open commission opportunity", tone: "green", up: false },
    { icon: "layers", label: "Active Deals", value: String(summary?.open ?? 0), delta: "open transactions", tone: "indigo", up: false },
    { icon: "file", label: "Under Contract", value: String(underContract), delta: "in contract / escrow", tone: "blue", up: false },
    { icon: "trophy", label: "Closed Won", value: String(summary?.won ?? 0), delta: fmtK(summary?.won_value ?? 0) + " won", tone: "emerald", up: (summary?.won ?? 0) > 0 },
  ];

  // Listing-side categories first (Seller default), then buyer/renter.
  const tabs = [
    { key: "Seller", label: "Sellers", icon: "building2" },
    { key: "Buyer", label: "Buyers", icon: "home" },
    { key: "Renter", label: "Renters", icon: "home" },
  ];
  // A lead is optional now; the picker offers every lead not already in a deal.
  const addLeads = leadOpts.filter((l) => !dealLeadIds.has(l.id));

  return (
    <div className="wc-page wc-fade">
      <div className="wc-pagehead">
        <div>
          <h1>Deals</h1>
          <p>{deals.length} {deals.length === 1 ? "transaction" : "transactions"} in the pipeline · {deals.length}/{MAX_DEALS.toLocaleString()} max</p>
        </div>
      </div>

      <div className="wc-tabs" style={{ marginBottom: 18 }}>
        <button className={"wc-tab" + (view === "pipeline" ? " is-on" : "")} onClick={() => setView("pipeline")}><Icon name="layers" size={15} />Pipeline</button>
        <button className={"wc-tab" + (view === "listings" ? " is-on" : "")} onClick={() => setView("listings")}><Icon name="home" size={15} />Listings</button>
      </div>

      {view === "listings" && <ListingsManager />}

      {view === "pipeline" && (
        <>
      <div className="wc-kpis">
        {kpis.map((k) => {
          const t = TONES[k.tone];
          return (
            <div className="wc-kpi" key={k.label}>
              <span className="wc-kpi-icon" style={{ color: t.fg, background: t.bg }}><Icon name={k.icon} size={17} /></span>
              <div className="wc-kpi-body">
                <div className="wc-kpi-label">{k.label}</div>
                <div className="wc-kpi-row">
                  <span className="wc-kpi-val wc-mono">{k.value}</span>
                  <span className={"wc-kpi-delta" + (k.up ? " is-up" : "")}>{k.delta}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="wc-deals-tabs">
        {tabs.map((tb) => (
          <button key={tb.key} className={"wc-dtab" + (tab === tb.key ? " is-on" : "")} onClick={() => setTab(tb.key)}>
            <Icon name={tb.icon} size={15} />{tb.label}
            <span className="wc-dtab-c">{deals.filter((d) => d.type === tb.key).length}</span>
          </button>
        ))}
      </div>

      <DealBoard type={tab} deals={deals} onMove={onMove} onAdd={onAdd} onEdit={setEditDeal} onDelete={setConfirmDel} />
        </>
      )}

      {addOpen && <AddDealModal type={addOpen.type} stage={addOpen.stage} leads={addLeads}
        members={members} currentUser={currentUser} isBroker={isBroker}
        onClose={() => setAddOpen(null)} onCreate={(d) => createMut.mutate(d)} />}

      {editDeal && editInit && <AddDealModal type={editDeal.type} stage={editDeal.stage} leads={addLeads}
        members={members} currentUser={currentUser} isBroker={isBroker} initial={editInit}
        onClose={() => setEditDeal(null)} onCreate={(d) => updateMut.mutate({ id: editDeal.id, d })} />}

      {confirmDel && (
        <Wcv2Portal>
          <div className="wc-modal-scrim" onClick={() => setConfirmDel(null)}>
            <div className="wc-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="wc-card-h2" style={{ marginBottom: 8 }}>Delete this deal?</div>
              <div className="wc-band-d" style={{ marginBottom: 18 }}>This permanently removes <strong>{confirmDel.name}</strong> from the pipeline. This cannot be undone.</div>
              <div className="wc-modal-foot">
                <button className="wc-ghostbtn" onClick={() => setConfirmDel(null)}>Cancel</button>
                <button className="wc-primary" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(confirmDel.id)}><Icon name="trash" size={14} />Delete deal</button>
              </div>
            </div>
          </div>
        </Wcv2Portal>
      )}
    </div>
  );
}

export default function DealsPage() {
  return (
    <MainLayout title="Deals">
      <div className="wcv2 min-h-[calc(100vh-4rem)] lg:-mx-4 lg:-mt-4">
        <DealsInner />
      </div>
    </MainLayout>
  );
}
