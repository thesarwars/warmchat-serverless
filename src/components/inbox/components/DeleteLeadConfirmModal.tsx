import { contactDisplayName } from "../utils/contactUtils";
import type { InboxContact } from "../types";

export default function DeleteLeadConfirmModal({
  open,
  contact,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  contact: InboxContact | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open || !contact) return null;
  return (
    <div className="fixed inset-0 z-85 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-gray-900">
          Delete contact?
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          This removes {contactDisplayName(contact)} from your leads.
          This cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
