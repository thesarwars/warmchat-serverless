import { useState } from "react";
import AutomationEnrollFields from "./AutomationEnrollFields";

export interface AddLeadCampaignChoice {
  automationId: number | null;
  inboundEnabled: boolean;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (choice: AddLeadCampaignChoice) => void;
};

/**
 * "Step 2" after a lead is added manually (from Leads or the Inbox): assign the
 * lead to an automation (campaign) and/or turn on AI inbound replies. The lead
 * is already created at this point (step 1 handled validation + duplicates), so
 * this step only enrolls - via the same /import/:org/apply-ai path the import
 * wizard uses. Reuses AutomationEnrollFields so the copy matches import exactly.
 */
export default function AddLeadCampaignModal({ open, onClose, onConfirm }: Props) {
  const [enrollEnabled, setEnrollEnabled] = useState(false);
  const [automationId, setAutomationId] = useState<number | null>(null);
  const [inboundEnabled, setInboundEnabled] = useState(true);

  if (!open) return null;

  const enrolled = enrollEnabled && automationId != null;

  const finish = () =>
    onConfirm({
      automationId: enrolled ? automationId : null,
      inboundEnabled,
    });

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-lead-campaign-title"
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <h2 id="add-lead-campaign-title" className="text-lg font-semibold text-gray-900">
          Lead added - start AI follow-up?
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Optionally enroll this lead in an automation and choose whether the AI
          replies when they message back. You can change this later from the Leads
          list.
        </p>

        <div className="mt-5">
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
            className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600"
          >
            {enrolled ? "Enroll in workflow" : "Finish"}
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
