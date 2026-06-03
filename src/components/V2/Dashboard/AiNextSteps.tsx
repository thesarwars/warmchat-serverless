import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";
import { useFetch } from "@/helpers/hooks";
import { fetchAiNextSteps } from "@/helpers/backend";

/* "AI Next Steps" dashboard guidance (docs/automations-ai-flow/Main AI Goal:
   "Dashboard Should Show AI Guidance"). Self-contained widget fed by the
   AI-maintained lead.next_best_action via /api/ai/next-steps. Tailwind to match
   the pure-white DashboardV2 aesthetic (NOT the .wcv2 design system). */

interface NextStepItem { lead_id: number; name: string; action: string; score: number | null; intent: string | null }
interface NextStepsData {
  items: NextStepItem[];
  summary: { hot_need_response: number; ready_to_book: number; nurturing: number; missing_info: number };
}

export default function AiNextSteps() {
  const navigate = useNavigate();
  const orgId = localStorage.getItem("org_id");
  const { data } = useFetch<NextStepsData>(
    ["ai_next_steps"],
    () => fetchAiNextSteps(orgId || "") as Promise<NextStepsData>,
    {},
    { enabled: Boolean(orgId) },
  );
  const items = data?.items ?? [];
  const s = data?.summary;

  const stat = (n: number, label: string) => (
    <div className="rounded-lg bg-gray-50 px-2.5 py-2">
      <div className="text-sm font-semibold text-gray-900">{n}</div>
      <div className="text-[11px] text-gray-400">{label}</div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500"><Sparkles size={14} className="text-white" /></span>
        <h3 className="text-sm font-semibold text-gray-900">AI Next Steps</h3>
      </div>
      {s && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {stat(s.hot_need_response, "hot need reply")}
          {stat(s.ready_to_book, "ready to book")}
          {stat(s.nurturing, "nurturing")}
          {stat(s.missing_info, "need info")}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {items.slice(0, 5).map((i) => (
          <button
            key={i.lead_id}
            onClick={() => navigate("/inbox")}
            className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-left transition hover:border-orange-200 hover:bg-orange-50/40"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-gray-900">{i.name}</div>
              <div className="truncate text-[11px] text-gray-400">{i.action}{i.score != null ? ` · score ${i.score}` : ""}</div>
            </div>
            <ArrowRight size={13} className="shrink-0 text-gray-300" />
          </button>
        ))}
        {items.length === 0 && (
          <div className="py-2 text-xs text-gray-400">No actions right now - the AI surfaces leads here as they need you.</div>
        )}
      </div>
    </div>
  );
}
