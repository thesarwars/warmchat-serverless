import type { UploadedAttachment } from "../../../utils/messageAttachments";
import type { InboxContact } from "../types";
import { AVATAR_COLOR } from "../constants";

export function avatarGradient(_name?: string) {
  return AVATAR_COLOR;
}

export function initials(name?: string | null) {
  const value = String(name || "").trim();
  if (!value) return "?";
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

export function contactDisplayName(contact?: Partial<InboxContact> | null) {
  if (!contact) return "Unknown Contact";
  return (
    contact.name ||
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    contact.email ||
    contact.phone ||
    "Unknown Contact"
  );
}

export function contactMeta(contact?: Partial<InboxContact> | null) {
  if (!contact) return "No contact selected";
  return (
    [contact.phone, contact.email].filter(Boolean).join(" * ") ||
    "No email or phone on file"
  );
}

export function isImageAttachment(attachment: UploadedAttachment) {
  const type = String(attachment.content_type || "").toLowerCase();
  const name = String(attachment.name || "").toLowerCase();
  return type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(name);
}

export function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/**
 * Validate any IANA zone via Intl.DateTimeFormat. Free-text overrides outside
 * the curated list still get a quick sanity check before save.
 */
function isValidTimezone(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * "8:42 AM" rendered in the given timezone. Returns an em-dash when the zone
 * is missing or invalid so callers can drop the result straight into a cell.
 */
export function formatLocalTime(
  timezone: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!timezone || !isValidTimezone(timezone)) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(now));
  } catch {
    return "-";
  }
}

