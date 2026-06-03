import React, { useMemo, useRef, useState } from "react";
import {
  Calendar,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
  Pencil,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  deleteScheduledMessage,
  fetchScheduledMessages,
  patchScheduledMessage,
} from "@/helpers/backend";
import { useApiMutation, useFetch } from "@/helpers/hooks";
import toast from "react-hot-toast";

type ScheduledStatus =
  | "scheduled"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled";

interface ScheduledMessage {
  id: number;
  user_id: number;
  org_id: number;
  contact_id: number | null;
  channel: "sms" | "email";
  to_address: string;
  subject: string | null;
  body: string;
  attachments: Array<Record<string, unknown>>;
  scheduled_at: string;
  status: ScheduledStatus;
  error_message: string | null;
  sent_message_id: number | null;
  sent_at: string | null;
  created_at: string;
}

interface ScheduledMessagesPanelProps {
  contactId: number | null;
}

const padZero = (n: number) => n.toString().padStart(2, "0");

const toLocalInput = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(
    d.getDate(),
  )}T${padZero(d.getHours())}:${padZero(d.getMinutes())}`;
};

const formatLocal = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

const channelIcon = (channel: ScheduledMessage["channel"]) =>
  channel === "email" ? (
    <Mail className="h-3.5 w-3.5 text-purple-500" />
  ) : (
    <MessageSquare className="h-3.5 w-3.5 text-orange-500" />
  );

const ScheduledMessagesPanel: React.FC<ScheduledMessagesPanelProps> = ({
  contactId,
}) => {
  const queryClient = useQueryClient();
  const toastIdRef = useRef<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editSendAt, setEditSendAt] = useState("");
  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);

  const { data, isPending } = useFetch<{ items: ScheduledMessage[] }>(
    ["scheduled-messages", "scheduled"],
    () =>
      fetchScheduledMessages({ status: "scheduled" }) as Promise<{
        items: ScheduledMessage[];
      }>,
    {},
    { enabled: contactId != null },
  );

  const items = useMemo(() => {
    const all = data?.items || [];
    if (contactId == null) return [] as ScheduledMessage[];
    return all
      .filter((m) => m.contact_id === contactId)
      .sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() -
          new Date(b.scheduled_at).getTime(),
      );
  }, [data, contactId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["scheduled-messages"] });
  };

   const updateMutation = useApiMutation<
    unknown,
    { id: number; payload: Record<string, unknown> }
  >(({ id, payload }) => patchScheduledMessage(id, payload), {
    onSuccess: () => {
      toast.success("Scheduled message updated");
      setEditingId(null);
      invalidate();
      if (toastIdRef.current) toast.dismiss(toastIdRef.current);
    },
    onError: () => {
      toast.error("Failed to update message");
      if (toastIdRef.current) toast.dismiss(toastIdRef.current);
    },
  });


  const cancelMutation = useApiMutation<unknown, number>(
    (id) => deleteScheduledMessage(id),
    {
      onSuccess: () => {
        toast.success("Scheduled message cancelled");
        setConfirmCancelId(null);
        invalidate();
      },
      onError: () => {
        toast.error("Failed to cancel message");
      },
    }
  );

  
  const beginEdit = (m: ScheduledMessage) => {
    setEditingId(m.id);
    setEditBody(m.body || "");
    setEditSubject(m.subject || "");
    setEditSendAt(toLocalInput(m.scheduled_at));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBody("");
    setEditSubject("");
    setEditSendAt("");
  };

  const submitEdit = (m: ScheduledMessage) => {
    if (!editSendAt) return;
    const when = new Date(editSendAt);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) {
      return;
    }
    const payload: Record<string, unknown> = {
      body: editBody,
      send_at: when.toISOString(),
    };
    if (m.channel === "email") {
      payload.subject = editSubject;
    }
    updateMutation.mutate({ id: m.id, payload });
  };

  if (contactId == null) return null;

  return (
    <div className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-orange-500" />
          <div className="text-sm font-semibold text-gray-900">
            Scheduled messages
          </div>
        </div>
        {items.length > 0 && (
          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
            {items.length}
          </span>
        )}
      </div>

      <div className="mt-3">
        {isPending ? (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading...
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-gray-500">
            No scheduled messages for this contact.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((m) => {
              const isEditing = editingId === m.id;
              const isConfirming = confirmCancelId === m.id;

              return (
                <li
                  key={m.id}
                  className="rounded-2xl border border-gray-200 bg-gray-50/40 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {channelIcon(m.channel)}
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {m.channel}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                        <Clock size={11} />
                        {formatLocal(m.scheduled_at)}
                      </span>
                    </div>
                    {!isEditing && !isConfirming && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => beginEdit(m)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 hover:bg-white hover:text-gray-700"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmCancelId(m.id)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
                          title="Cancel scheduled send"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-2 space-y-2">
                      <input
                        type="datetime-local"
                        value={editSendAt}
                        onChange={(e) => setEditSendAt(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-hidden focus:border-orange-300"
                      />
                      {m.channel === "email" && (
                        <input
                          type="text"
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          placeholder="Subject"
                          className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-hidden focus:border-orange-300"
                        />
                      )}
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs outline-hidden focus:border-orange-300"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={updateMutation.isPending}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-white"
                        >
                          <X size={12} />
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => submitEdit(m)}
                          disabled={updateMutation.isPending}
                          className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                        >
                          {updateMutation.isPending ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Save size={12} />
                          )}
                          Save
                        </button>
                      </div>
                    </div>
                  ) : isConfirming ? (
                    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2">
                      <p className="text-xs text-red-700">
                        Cancel this scheduled send?
                      </p>
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmCancelId(null)}
                          disabled={cancelMutation.isPending}
                          className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700"
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelMutation.mutate(m.id)}
                          disabled={cancelMutation.isPending}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {cancelMutation.isPending && (
                            <Loader2 size={12} className="animate-spin" />
                          )}
                          Yes, cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {m.subject && (
                        <p className="mt-1 truncate text-xs font-semibold text-gray-800">
                          {m.subject}
                        </p>
                      )}
                      <p className="mt-1 line-clamp-2 text-xs text-gray-600">
                        {m.body || "(no body)"}
                      </p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ScheduledMessagesPanel;
