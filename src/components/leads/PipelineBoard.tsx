import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Clock, MessageSquare } from "lucide-react";
import { PIPELINE_STAGES, STAGE_SCORE } from "./constants";
import type { EditingLead, QuickFilterId } from "./types";
import {
  formatRelativeUpdated,
  getAiStatus,
  getLeadType,
  getPriceRange,
  getStageValue,
  leadInitials,
  scoreFillColor,
  stageDotColor,
} from "./utils/leadDisplay";

/**
 * Pipeline (kanban) view for the Leads page - a Trello-style board with one
 * column per Stage (Lost excluded). Each column lazy-loads its own leads from
 * the server (`/api/leads/:orgId?statuses=<stage>` with the same search + quick
 * filters and "+N more" paging), and dragging a card to another column persists
 * the lead's new Stage (PUT /leads/:id { status }). Mirrors the Deals board.
 *
 * Re-skinned to the spec's wc-board / wc-col / wc-card classes; the stage color
 * is passed as a `--stage` CSS variable so the column dot, probability pill, and
 * the card's 3px left border all pick it up.
 */

const PER = 10;

type MoveFn = (lead: EditingLead, toStage: string) => void;

/** Map a normalized lead type to the spec's wc-chip color variant. */
function typeChipClass(t: string) {
  if (t === "Buyer") return "wc-chip wc-chip-buyer";
  if (t === "Seller") return "wc-chip wc-chip-seller";
  if (t === "Renter") return "wc-chip wc-chip-renter";
  return "wc-chip wc-tag";
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="wc-score" title={`Score ${score}%`}>
      <span className="wc-score-track">
        <span
          className="wc-score-fill"
          style={{ width: `${score}%`, background: scoreFillColor(score) }}
        />
      </span>
      <span className="wc-score-num" style={{ color: scoreFillColor(score) }}>
        {score}
      </span>
    </div>
  );
}

function LeadKanbanCard({
  lead,
  stageColor,
  isActive,
  onOpen,
  onDragStart,
}: {
  lead: EditingLead;
  stageColor: string;
  isActive: boolean;
  onOpen: (lead: EditingLead) => void;
  onDragStart: (lead: EditingLead) => void;
}) {
  const leadType = getLeadType(lead);
  const budget = getPriceRange(lead);
  const score = STAGE_SCORE[getStageValue(lead)] ?? 0;
  const aiActive = getAiStatus(lead) === "AI Active";
  const needsReply = Boolean(
    (lead as Record<string, unknown>).needs_reply ?? (lead as Record<string, unknown>).needsReply,
  );
  return (
    <div
      data-lead-card
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart(lead);
      }}
      onClick={() => onOpen(lead)}
      className={`wc-card${isActive ? " is-active" : ""}`}
      style={{ ["--stage" as string]: stageColor }}
    >
      <div className="wc-card-top">
        <span className="wc-avatar wc-avatar-grey" style={{ width: 32, height: 32, fontSize: 11 }}>
          {leadInitials(lead.name)}
        </span>
        <div className="wc-card-id">
          <div className="wc-card-name" title={lead.name || undefined}>
            <span className="truncate">{lead.name || "-"}</span>
          </div>
          <div className="wc-card-sub truncate">
            {lead.source?.trim() ? lead.source : lead.email || lead.phone || "-"}
          </div>
        </div>
        {needsReply ? (
          <span className="wc-needsreply" title="Needs reply">
            <MessageSquare size={13} />
          </span>
        ) : null}
      </div>

      <div className="wc-card-meta">
        <span className={typeChipClass(leadType)}>{leadType}</span>
        {budget !== "-" ? <span className="wc-tag wc-tag-ok">{budget}</span> : null}
      </div>

      <div className="wc-card-foot">
        <span className="wc-card-age">
          <Clock size={12} />
          {formatRelativeUpdated(lead.updated_at)}
        </span>
        {aiActive ? (
          <span className="wc-ai-pill">
            <span className="wc-ai-dot" />
            AI
          </span>
        ) : (
          <ScoreBar score={score} />
        )}
      </div>

      {/* When the card already shows the AI pill in the foot, surface the score
          on its own row below (spec: "If AI and score, a second ScoreBar renders below"). */}
      {aiActive ? <ScoreBar score={score} /> : null}
    </div>
  );
}

function PipelineColumn({
  stage,
  apiBase,
  token,
  orgId,
  query,
  reloadKey,
  activeId,
  onOpen,
  onDragStart,
  isOver,
  onOver,
  onLeave,
  onDrop,
}: {
  stage: string;
  apiBase: string;
  token: string | null;
  orgId: string | null;
  query: string;
  reloadKey: number;
  activeId: number | null;
  onOpen: (lead: EditingLead) => void;
  onDragStart: (lead: EditingLead) => void;
  isOver: boolean;
  onOver: () => void;
  onLeave: () => void;
  onDrop: () => void;
}) {
  const [items, setItems] = useState<EditingLead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!token || !orgId) return;
      setLoading(true);
      try {
        const params = new URLSearchParams(query);
        params.set("include_meta", "1");
        params.set("statuses", stage);
        params.set("page", String(pageNum));
        params.set("page_size", String(PER));
        const res = await fetch(`${apiBase}/leads/${orgId}?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          items?: EditingLead[];
          pagination?: { total?: number };
        };
        const rows = Array.isArray(data?.items) ? data.items : [];
        setItems((prev) => (append ? [...prev, ...rows] : rows));
        setTotal(typeof data?.pagination?.total === "number" ? data.pagination.total : rows.length);
      } catch {
        if (!append) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        setLoading(false);
      }
    },
    [apiBase, token, orgId, query, stage],
  );

  // Reset + reload page 1 whenever the filters or a move signal change.
  useEffect(() => {
    setPage(1);
    void fetchPage(1, false);
  }, [fetchPage, reloadKey]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    void fetchPage(next, true);
  };

  const score = STAGE_SCORE[stage] ?? 0;
  const color = stageDotColor(stage);

  return (
    <div
      className={`wc-col${isOver ? " is-over" : ""}`}
      style={{ ["--stage" as string]: color }}
      onDragOver={(e) => {
        e.preventDefault();
        onOver();
      }}
      onDragLeave={onLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <div className="wc-col-head">
        <div className="wc-col-title">
          <span className="wc-col-dot" />
          <span className="truncate">{stage}</span>
          <span className="wc-col-count">{total}</span>
        </div>
        <span className="wc-col-prob">{score}%</span>
      </div>

      <div className="wc-col-body">
        {items.map((lead) => (
          <LeadKanbanCard
            key={lead.id}
            lead={lead}
            stageColor={color}
            isActive={activeId === lead.id}
            onOpen={onOpen}
            onDragStart={onDragStart}
          />
        ))}
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : null}
        {!loading && items.length === 0 ? <div className="wc-col-empty">No leads</div> : null}
        {total > items.length ? (
          <button type="button" onClick={loadMore} disabled={loading} className="wc-col-more">
            {loading ? "Loading..." : `+ ${total - items.length} more`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function PipelineBoard({
  apiBase,
  token,
  orgId,
  debouncedSearch,
  quickFilters,
  activeLeadId = null,
  onOpenLead,
  onChanged,
}: {
  apiBase: string;
  token: string | null;
  orgId: string | null;
  debouncedSearch: string;
  quickFilters: QuickFilterId[];
  activeLeadId?: number | null;
  onOpenLead: (lead: EditingLead) => void;
  onChanged: () => void;
}) {
  const [dragLead, setDragLead] = useState<EditingLead | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  // Per-stage reload signal - bumped on a move so only the affected columns refetch.
  const [reloadKeys, setReloadKeys] = useState<Record<string, number>>({});
  const boardRef = useRef<HTMLDivElement>(null);

  // Click-and-drag panning: grab empty board/column space (mouse) to scroll the
  // columns left/right. Cards and controls keep their own behaviour. Touch pans
  // natively via overflow-x:auto, so we only hijack the mouse.
  const pan = useRef({ active: false, startX: 0, startScroll: 0 });
  const [grabbing, setGrabbing] = useState(false);
  const onPanDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-lead-card], button, input, select, textarea, a")) return;
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
  const endPan = () => {
    if (pan.current.active) {
      pan.current.active = false;
      setGrabbing(false);
    }
  };

  // While a card is being dragged near an edge, auto-scroll the board so you can
  // drop it onto an off-screen column.
  const auto = useRef({ raf: 0, vx: 0 });
  const stopAuto = () => {
    if (auto.current.raf) cancelAnimationFrame(auto.current.raf);
    auto.current = { raf: 0, vx: 0 };
  };
  const tick = () => {
    const el = boardRef.current;
    if (el && auto.current.vx) {
      el.scrollLeft += auto.current.vx;
      auto.current.raf = requestAnimationFrame(tick);
    } else {
      auto.current.raf = 0;
    }
  };
  const onBoardDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const el = boardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const EDGE = 90, MAX = 22; // px-wide hot zone, max px/frame
    const fromLeft = e.clientX - r.left;
    const fromRight = r.right - e.clientX;
    let vx = 0;
    if (fromLeft < EDGE) vx = -Math.ceil(((EDGE - fromLeft) / EDGE) * MAX);
    else if (fromRight < EDGE) vx = Math.ceil(((EDGE - fromRight) / EDGE) * MAX);
    auto.current.vx = vx;
    if (vx && !auto.current.raf) auto.current.raf = requestAnimationFrame(tick);
    else if (!vx) stopAuto();
  };
  useEffect(() => () => stopAuto(), []);

  // The shared filter query string (search + quick) applied to every column.
  const query = (() => {
    const params = new URLSearchParams();
    const q = debouncedSearch.trim();
    if (q) params.set("q", q);
    for (const qf of quickFilters) params.append("quick", qf === "hot" ? "hot_leads" : qf);
    return params.toString();
  })();

  const bump = (stage: string) =>
    setReloadKeys((prev) => ({ ...prev, [stage]: (prev[stage] ?? 0) + 1 }));

  const handleMove: MoveFn = useCallback(
    (lead, toStage) => {
      const from = getStageValue(lead);
      if (from === toStage || !token) return;
      void (async () => {
        try {
          await fetch(`${apiBase}/leads/${lead.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: toStage }),
          });
        } catch {
          /* a failed move just leaves the card where it was after refetch */
        } finally {
          bump(from);
          bump(toStage);
          onChanged();
        }
      })();
    },
    [apiBase, token, onChanged],
  );

  return (
    <div
      ref={boardRef}
      className={`wc-board wc-board-pan${grabbing ? " is-grabbing" : ""}`}
      onPointerDown={onPanDown}
      onPointerMove={onPanMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onDragOver={onBoardDragOver}
      onDrop={stopAuto}
    >
      {PIPELINE_STAGES.map((stage) => (
        <PipelineColumn
          key={stage}
          stage={stage}
          apiBase={apiBase}
          token={token}
          orgId={orgId}
          query={query}
          // Per-stage move signal; filter changes reload via fetchPage's deps.
          reloadKey={reloadKeys[stage] ?? 0}
          activeId={activeLeadId}
          onOpen={onOpenLead}
          onDragStart={setDragLead}
          isOver={overStage === stage}
          onOver={() => setOverStage(stage)}
          onLeave={() => setOverStage((s) => (s === stage ? null : s))}
          onDrop={() => {
            if (dragLead) handleMove(dragLead, stage);
            setDragLead(null);
            setOverStage(null);
          }}
        />
      ))}
    </div>
  );
}
