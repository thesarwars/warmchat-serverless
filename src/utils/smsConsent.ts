type SmsErrorResponse = {
  error?: string;
  message?: string;
  errors?: { error?: string }[];
};

export const extractSmsErrorMessage = (data: SmsErrorResponse | null | undefined): string => {
  if (!data) return "Failed to send SMS.";
  if (typeof data.error === "string" && data.error.trim()) return data.error;
  if (typeof data.message === "string" && data.message.trim()) return data.message;
  if (Array.isArray(data.errors) && data.errors.length) {
    const first = data.errors[0];
    if (first && typeof first.error === "string" && first.error.trim()) return first.error;
  }
  return "Failed to send SMS.";
};

export const isSmsConsentError = (msg: string): boolean => {
  const value = (msg || "").toLowerCase();
  return (
    value.includes("consent") ||
    value.includes("subscribed") ||
    value.includes("opt in") ||
    value.includes("opt-in") ||
    value.includes("opted out")
  );
};

export const isSmsPendingConfirmationError = (msg: string): boolean => {
  const value = (msg || "").toLowerCase();
  return value.includes("pending confirmation") || value.includes("reply yes");
};
