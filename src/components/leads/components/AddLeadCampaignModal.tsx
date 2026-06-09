import { useState } from "react";
import AutomationEnrollFields from "./AutomationEnrollFields";

export type FollowUpAction = "send_now" | "schedule" | "dont_send";

export interface AddLeadCampaignChoice {
  action: FollowUpAction;
  scheduledAt: string | null; // ISO, only when action === "schedule"
  automationId: number | null;
  inboundEnabled: boolean;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (choice: AddLeadCampaignChoice) => void;
};

/**
 * "Step 2" after a lead is added manually: the spec's "Start AI follow-up?" gate
 * - Send now / Schedule / Don't send - which controls the speed-to-lead sequence
 * (instant opening + no-reply nudges). Prevents old/manual leads from getting
 * auto-texted unless the agent opts in. Optionally also enroll in a campaign.
 * The lead is already created at this point.
 */
const CHOICES: { key: FollowUpAction; label: string; desc: string }[] = [
  { key: "send_now", label: "Send now", desc: "AI texts the lead right away, then follows up if they don't reply." },
  { key: "schedule", label: "Schedule", desc: "Start the AI follow-up at a specific date & time." },
  { key: "dont_send", label: "Don't send", desc: "Just add the lead - no automated outreach." },
];

export default function AddLeadCampaignModal({ open, onClose, onConfirm }: Props) {
  const [action, setAction] = useState<FollowUpAction>("send_now");
  const [scheduledAt, setScheduledAt] = useState(""); // datetime-local
  const [enrollEnabled, setEnrollEnabled] = useState(false);
  const [automationId, setAutomationId] = useState<number | null>(null);
  const [inboundEnabled, setInboundEnabled] = useState(true);

  if (!open) return null;

  const enrolled = enrollEnabled && automationId != null;
  const scheduleInvalid = action === "schedule" && !scheduledAt;

  const finish = () =>
    onConfirm({
      action,
      scheduledAt: action === "schedule" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      automationId: enrolled ? automationId : null,
      // Send now / Schedule turn on inbound AI replies so the AI handles the
      // conversation; Don't send leaves inbound as the agent picked below.
      inboundEnabled: action !== "dont_send" ? true : inboundEnabled,
    });

  const ctaLabel =
    action === "send_now" ? "Add & start follow-up"
      : action === "schedule" ? "Add & schedule follow-up"
        : enrolled ? "Add & enroll in workflow" : "Add lead";

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-lead-campaign-title"
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <h2 id="add-lead-campaign-title" className="text-lg font-semibold text-gray-900">
          Start AI follow-up?
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Choose whether the AI should reach out to this lead. This prevents old or
          manually-added leads from getting auto-texted unless you want it.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          {CHOICES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setAction(c.key)}
              className={
                "flex flex-col items-start rounded-lg border px-4 py-3 text-left transition " +
                (action === c.key
                  ? "border-orange-500 bg-orange-50 ring-1 ring-orange-500"
                  : "border-gray-200 hover:border-gray-300")
              }
            >
              <span className="text-sm font-semibold text-gray-900">{c.label}</span>
              <span className="mt-0.5 text-xs text-gray-500">{c.desc}</span>
            </button>
          ))}
        </div>

        {action === "schedule" && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-700">Send at</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        )}

        <div className="mt-5 border-t border-gray-100 pt-4">
          <AutomationEnrollFields
            scope="single"
            enabled={enrollEnabled}
            onEnabledChange={setEnrollEnabled}
            automationId={automationId}
            onAutomationChange={setAutomationId}
            inboundEnabled={inboundEnabled}
            onInboundEnabledChange={setInboundEnabled}
          />
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={finish}
            disabled={scheduleInvalid}
            className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ctaLabel}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
