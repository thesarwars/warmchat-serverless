import { Loader2 } from "lucide-react";

export type DeleteLeadModalProps = {
  open: boolean;
  deleteTargetIds: number[];
  message: string;
  deletingLeads: boolean;
  deleteProgress: { done: number; total: number };
  onClose: () => void;
  onDelete: () => void;
};

export default function DeleteLeadModal({
  open,
  deleteTargetIds,
  message,
  deletingLeads,
  deleteProgress,
  onClose,
  onDelete,
}: DeleteLeadModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-leads-title"
        className="bg-white p-6 rounded-xl w-full max-w-sm shadow-xl"
      >
        <h2
          id="delete-leads-title"
          className="text-lg font-semibold mb-2 text-gray-900"
        >
          {deleteTargetIds.length === 1
            ? "Delete this lead?"
            : `Delete ${deleteTargetIds.length} leads?`}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {deleteTargetIds.length === 1
            ? "This cannot be undone. Leads linked to automations or inbox threads may not be removable."
            : "Selected leads will be removed. Some may fail if they are linked to automations or messages."}
        </p>

        {message && <p className="mb-3 text-sm text-red-600">{message}</p>}

        {deletingLeads && deleteProgress.total > 0 ? (
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-gray-600">
              <span>
                {deleteProgress.done > 0
                  ? `Deleted ${deleteProgress.done} of ${deleteProgress.total}`
                  : `Deleting ${deleteProgress.total} lead${deleteProgress.total === 1 ? "" : "s"}...`}
              </span>
              <span>
                {Math.round(
                  (deleteProgress.done / Math.max(deleteProgress.total, 1)) * 100,
                )}
                %
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full bg-red-500 transition-all duration-200 ${
                  deleteProgress.done === 0 ? "animate-pulse" : ""
                }`}
                style={{
                  width:
                    deleteProgress.done === 0
                      ? "20%"
                      : `${(deleteProgress.done / deleteProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={deletingLeads}
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deletingLeads}
            onClick={onDelete}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-semibold disabled:opacity-50"
          >
            {deletingLeads && <Loader2 size={14} className="animate-spin" />}
            {deleteTargetIds.length === 1 ? "Delete" : "Delete all"}
          </button>
        </div>
      </div>
    </div>
  );
}
