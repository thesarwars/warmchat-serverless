/** Normalize a raw phone string to E.164. */
export function normalizeE164(raw: string | null | undefined, defaultCountryCode = "1"): string {
  if (!raw) throw new Error("Phone number is required");
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    return "+" + trimmed.replace(/\D/g, "");
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+${defaultCountryCode}${digits}`;
  if (digits.length === 11 && digits.startsWith(defaultCountryCode)) return `+${digits}`;
  throw new Error("Invalid phone number format");
}

/** Best-effort variant - never throws; returns null when input is unusable. */
export function tryNormalizeE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return normalizeE164(raw);
  } catch {
    return (raw || "").trim() || null;
  }
}
