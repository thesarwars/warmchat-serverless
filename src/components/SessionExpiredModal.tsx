// SessionExpiredModal.tsx
import React from "react";

interface Props {
  open: boolean;
  onConfirm: () => void;
}

const SessionExpiredModal: React.FC<Props> = ({ open, onConfirm }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-9999">
      <div className="bg-white p-6 rounded-lg shadow-lg w-[90%] max-w-md text-center">
        <h2 className="text-xl font-bold mb-4">Session Expired</h2>
        <p className="text-gray-600 mb-6">
          Your session has expired. Please log in again.
        </p>
        <button
          onClick={onConfirm}
          className="bg-warmchats-primary text-white px-6 py-2 rounded-lg hover:bg-warmchats-primary-dark transition"
        >
          OK
        </button>
      </div>
    </div>
  );
};

export default SessionExpiredModal;
