import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { PIPELINE_STAGES, STAGE_SCORE } from "./constants";
import type { EditingLead, QuickFilterId } from "./types";
import {
  formatRelativeUpdated,
  getAiStatus,
  getLeadType,
  getPriceRange,
  getStageValue,
  leadInitials,
  leadTypePillClass,
  scoreColor,
  stageDotColor,
} from "./utils/leadDisplay";

/**
 * Pipeline (kanban) view for the Leads page - a Trello-style board with one
 * column per Stage (Lost excluded). Each column lazy-loads its own leads from
 * the server (`/api/leads/:orgId?statuses=<stage>` with the same search + quick
 * filters and "+N more" paging), and dragging a card to another column persists
 * the lead's new Stage (PUT /leads/:id { status }). Mirrors the Deals board.
 */

const PER = 10;

type MoveFn = (lead: EditingLead, toStage: string) => void;

function scoreBar(score: number) {
  const c = scoreColor(score);
  return (
    <div className="flex items-center gap-2" title={`Score ${score}%`}>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <span className={`block h-full rounded-full ${c.bar}`} style={{ width: `${score}%` }} />
      </span>
      <span className={`text-xs font-semibold tabular-nums ${c.text}`}>{score}</span>
    </div>
  );
}

function LeadKanbanCard({
  lead,
  onOpen,
  onDragStart,
}: {
  lead: EditingLead;
  onOpen: (lead: EditingLead) => void;
  onDragStart: (lead: EditingLead) => void;
}) {
  const leadType = getLeadType(lead);
  const budget = getPriceRange(lead);
  const score = STAGE_SCORE[getStageValue(lead)] ?? 0;
  const hot = score > 45;
  const aiActive = getAiStatus(lead) === "AI Active";
  return (
    <div
      data-lead-card
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart(lead);
      }}
      onClick={() => onOpen(lead)}
      className={`cursor-pointer rounded-xl border bg-white p-3 shadow-sm transition hover:shadow ${
        hot ? "border-l-4 border-l-orange-400 border-y border-r border-gray-100" : "border border-gray-100"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-gray-200 to-gray-100 text-[11px] font-semibold uppercase text-gray-700">
          {leadInitials(lead.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-gray-900" title={lead.name || undefined}>{lead.name || "-"}</div>
          <div className="truncate text-xs text-gray-500">
            {lead.source?.trim() ? lead.source : lead.email || lead.phone || "-"}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${leadTypePillClass(leadType)}`}>
          {leadType}
        </span>
        {budget !== "-" ? (
          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            {budget}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">{formatRelativeUpdated(lead.updated_at)}</span>
        {aiActive ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <Sparkles size={11} /> AI
          </span>
        ) : null}
      </div>

      <div className="mt-2">{scoreBar(score)}</div>
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

  return (
    <div
      className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-gray-50/70 ${
        isOver ? "border-orange-300 ring-2 ring-orange-200" : "border-gray-100"
      }`}
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
      <div
        className="flex items-center justify-between gap-2 rounded-t-2xl border-b border-gray-100 px-3 py-2.5"
        style={{ borderTop: `3px solid ${stageDotColor(stage)}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stageDotColor(stage) }} />
          <span className="truncate text-sm font-semibold text-gray-800">{stage}</span>
          <span className="text-xs font-medium text-gray-400">{total}</span>
        </div>
        <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-orange-600 shadow-sm">
          {score}%
        </span>
      </div>

      <div className="flex min-h-24 flex-1 flex-col gap-2 p-2.5">
        {items.map((lead) => (
          <LeadKanbanCard key={lead.id} lead={lead} onOpen={onOpen} onDragStart={onDragStart} />
        ))}
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : null}
        {!loading && items.length === 0 ? (
          <div className="px-1 py-6 text-center text-xs text-gray-400">No leads</div>
        ) : null}
        {total > items.length ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded-lg border border-dashed border-gray-200 bg-white px-2 py-2 text-xs font-semibold text-gray-500 hover:border-orange-300 hover:text-orange-600 disabled:opacity-50"
          >
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
  onOpenLead,
  onChanged,
}: {
  apiBase: string;
  token: string | null;
  orgId: string | null;
  debouncedSearch: string;
  quickFilters: QuickFilterId[];
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
      className={`flex gap-3 overflow-x-auto pb-2 ${grabbing ? "cursor-grabbing select-none" : "cursor-grab"}`}
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
