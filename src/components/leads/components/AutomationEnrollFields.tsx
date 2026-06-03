import { useEffect, useState } from "react";
import { Bot, Megaphone, Lightbulb, Zap, Clock } from "lucide-react";
import { baseURL as API_BASE } from "@/helpers/api";
import { describeStep } from "@/utils/workflowSchedule";
import AiOffWarning from "./AiOffWarning";

interface WorkflowStep { delay_days?: number; message?: string; send_time?: string }
interface AutomationOption {
  id: number;
  name: string;
  status?: string;
  message?: string;
  opening_send_time?: string | null;
  channels?: string[];
  followup_steps?: WorkflowStep[];
}

type Props = {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  automationId: number | null;
  onAutomationChange: (id: number | null) => void;
  inboundEnabled: boolean;
  onInboundEnabledChange: (v: boolean) => void;
  // Copy tweak: "imported leads" (batch) vs "this lead" (single add).
  scope?: "import" | "single";
};

const Toggle = ({
  checked,
  onChange,
  size = "md",
}: {
  checked: boolean;
  onChange: () => void;
  size?: "md" | "lg";
}) => {
  const track = size === "lg" ? "w-20 h-11" : "w-14 h-8";
  const knob = size === "lg" ? "w-9 h-9" : "w-6 h-6";
  const on = size === "lg" ? "translate-x-10" : "translate-x-7";
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex ${track} shrink-0 items-center rounded-full transition ${
        checked ? "bg-orange-500" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block ${knob} transform rounded-full bg-white shadow transition ${
          checked ? on : "translate-x-1"
        }`}
      />
    </button>
  );
};

/**
 * A compact vertical timeline of a workflow's steps - the opening (instant) plus
 * each timed follow-up with the real day/date it lands on if started today. Same
 * info the Outbound workflow list shows, surfaced here so the agent sees exactly
 * what the leads they are enrolling will receive and when.
 */
function WorkflowStepsPreview({ option }: { option: AutomationOption }) {
  const chan = (option.channels || []).join(", ") || "sms";
  const openTime = (option.opening_send_time || "").trim() || null;
  const steps = [
    { body: option.message || "", send_time: openTime, day: 0, instant: !openTime },
    ...((option.followup_steps || []).map((s) => ({
      body: s.message || "", send_time: s.send_time ?? null, day: Number(s.delay_days) || 0, instant: false,
    }))),
  ];
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Clock size={13} className="text-orange-500" /> {steps.length} step{steps.length === 1 ? "" : "s"} · stops on reply
      </div>
      <div className="space-y-2.5">
        {steps.map((s, i) => {
          const sc = describeStep(s.day, s.send_time, { instant: s.instant });
          return (
            <div key={i} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${s.instant ? "bg-orange-500" : "bg-gray-400"}`}>{i + 1}</span>
                {i < steps.length - 1 && <span className="mt-0.5 w-px flex-1 bg-gray-200" />}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-700">
                  {s.instant ? <><Zap size={11} className="text-orange-500" />Instant · sends right away (~{sc.timeLabel})</> : <>{sc.dayLabel} · {sc.dateLabel} · {sc.timeLabel}</>}
                  <span className="text-gray-300">·</span><span className="font-medium text-gray-400">{chan}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-gray-500">{s.body || "(no message)"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The campaign-enrollment fields shared by the lead import wizard (step 4) and
 * the manual Add-Lead "step 2", so the two flows stay copy-identical: enroll
 * toggle -> automation picker -> inbound-replies toggle, plus the AI-off
 * warning. Fetches the org's automations itself.
 */
export default function AutomationEnrollFields({
  enabled,
  onEnabledChange,
  automationId,
  onAutomationChange,
  inboundEnabled,
  onInboundEnabledChange,
  scope = "import",
}: Props) {
  const [automations, setAutomations] = useState<AutomationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const token = localStorage.getItem("token") || "";
  const orgId = localStorage.getItem("org_id") || "";
  const who = scope === "single" ? "this lead is" : "the imported leads are";
  const whoShort = scope === "single" ? "this lead" : "these leads";
  const selectedAutomation = automations.find((a) => a.id === automationId);

  useEffect(() => {
    if (!orgId || !token) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/automations/org/${orgId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setAutomations(
              data.map((c: AutomationOption) => ({
                id: c.id, name: c.name, status: c.status,
                message: c.message, channels: c.channels,
                opening_send_time: c.opening_send_time ?? null,
                followup_steps: Array.isArray(c.followup_steps) ? c.followup_steps : [],
              })),
            );
          }
        }
      } catch {
        /* leave empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, token]);

  // Default to the first automation once loaded so enabling never leaves the
  // selection blank.
  useEffect(() => {
    if (enabled && automationId == null && automations.length > 0) {
      onAutomationChange(automations[0].id);
    }
  }, [enabled, automationId, automations, onAutomationChange]);

  return (
    <div className="space-y-5">
      {enabled && (
        <AiOffWarning enrollAutomation={automationId != null} inboundEnabled={inboundEnabled} />
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Bot className="text-orange-500 shrink-0" size={22} />
          <div>
            <p className="text-base font-semibold text-gray-900">Enroll in a workflow</p>
            <p className="text-xs text-gray-500 mt-0.5">
              When ON, {who} enrolled in the workflow you pick and start
              receiving its messages over time. A lead can only run one workflow
              at a time, and follow-ups stop the moment they reply.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-semibold text-gray-700">{enabled ? "ON" : "OFF"}</span>
          <Toggle checked={enabled} onChange={() => onEnabledChange(!enabled)} />
        </div>
      </div>

      {!enabled && (
        <p className="text-sm text-gray-500 rounded-lg border border-dashed border-gray-200 p-4">
          {scope === "single" ? "This lead is added" : "Leads will import"} without
          being enrolled in any workflow. You can enroll {scope === "single" ? "it" : "them"}
          {" "}later from the Leads list.
        </p>
      )}

      {enabled && (
        <>
          <section className="rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Megaphone size={16} className="text-orange-500" />
              <p className="text-sm font-semibold text-gray-800">Workflow</p>
            </div>
            {loading ? (
              <p className="text-sm text-gray-500">Loading workflows...</p>
            ) : automations.length === 0 ? (
              <p className="text-sm text-gray-500 rounded-lg border border-dashed border-gray-200 p-3">
                No workflows yet. Create one under AI - Outbound - Workflows
                first, then come back to enroll {whoShort}.
              </p>
            ) : (
              <>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={automationId ?? ""}
                  onChange={(e) =>
                    onAutomationChange(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  {automations.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {selectedAutomation && <WorkflowStepsPreview option={selectedAutomation} />}
              </>
            )}
            <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-100 p-3 text-xs text-amber-900">
              <Lightbulb size={16} className="shrink-0 mt-0.5" />
              <p>
                The workflow sends its first message instantly after {scope === "single" ? "adding" : "import"},
                then follows up at each step's scheduled time until the lead replies.
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">AI follow-up replies (inbound)</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  When ON, AI automatically replies to {whoShort} when they message
                  back. Independent of the workflow - you can run the outbound
                  workflow without auto-replies, or vice versa.
                </p>
              </div>
              <Toggle
                checked={inboundEnabled}
                onChange={() => onInboundEnabledChange(!inboundEnabled)}
                size="lg"
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
