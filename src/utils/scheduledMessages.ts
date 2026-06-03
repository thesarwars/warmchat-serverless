const API_BASE = import.meta.env.VITE_API_BASE;

export type ScheduledChannel = "sms" | "email";
type ScheduledStatus =
  | "scheduled"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled";

export interface ScheduledMessage {
  id: number;
  user_id: number;
  org_id: number;
  contact_id: number | null;
  channel: ScheduledChannel;
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

export interface CreateScheduledMessagePayload {
  channel: ScheduledChannel;
  to_address: string;
  body: string;
  contact_id: number;
  send_at: string;
  subject?: string | null;
  attachments?: Array<Record<string, unknown>>;
}


const authHeaders = (token: string) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

const handle = async <T>(res: Response): Promise<T> => {
  const data: { error?: string; message?: string } | T = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errData = data as { error?: string; message?: string };
    const msg = errData?.error || errData?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
};

export const createScheduledMessage = async (
  token: string,
  payload: CreateScheduledMessagePayload,
): Promise<ScheduledMessage> => {
  const res = await fetch(`${API_BASE}/inbox/scheduled`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  return handle<ScheduledMessage>(res);
};

// const listScheduledMessages = async (
//   token: string,
//   status?: ScheduledStatus,
// ): Promise<ScheduledMessage[]> => {
//   const qs = status ? `?status=${encodeURIComponent(status)}` : "";
//   const res = await fetch(`${API_BASE}/inbox/scheduled${qs}`, {
//     headers: authHeaders(token),
//   });
//   const data = await handle<{ items: ScheduledMessage[] }>(res);
//   return Array.isArray(data.items) ? data.items : [];
// };

// const updateScheduledMessage = async (
//   token: string,
//   id: number,
//   payload: UpdateScheduledMessagePayload,
// ): Promise<ScheduledMessage> => {
//   const res = await fetch(`${API_BASE}/inbox/scheduled/${id}`, {
//     method: "PATCH",
//     headers: authHeaders(token),
//     body: JSON.stringify(payload),
//   });
//   return handle<ScheduledMessage>(res);
// };

// const cancelScheduledMessage = async (
//   token: string,
//   id: number,
// ): Promise<void> => {
//   const res = await fetch(`${API_BASE}/inbox/scheduled/${id}`, {
//     method: "DELETE",
//     headers: authHeaders(token),
//   });
//   if (!res.ok && res.status !== 204) {
//     const data = await res.json().catch(() => ({}));
//     throw new Error(
//       (data as any)?.error ||
//         (data as any)?.message ||
//         `Cancel failed (${res.status})`,
//     );
//   }
// };
