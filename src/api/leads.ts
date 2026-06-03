/**
 * Lead-related constants and helpers shared by inbox and lead components.
 *
 * Phase 1 (UI only): exposes the booking-message variations and the default
 * missed-call template. The dispatcher / send-side wiring for these lives in
 * the inbox composer path (`sendInboxSms`); no dedicated booking endpoint
 * exists in the serverless backend yet (Phase 2).
 */

export type BookingVariation = "default" | "soft" | "value" | "direct";

export const BOOKING_MESSAGE_VARIATIONS: Record<
  BookingVariation,
  { label: string; text: string }
> = {
  default: {
    label: "Default",
    text: "Based on what you're looking for, it probably makes sense to connect for a few minutes. I can walk you through your options. When are you available to call?",
  },
  soft: {
    label: "Soft",
    text: "Makes sense to hop on a quick call. I can walk you through what's available. Are you available today or tomorrow at 1 or 2pm?",
  },
  value: {
    label: "Value-driven",
    text: "I can walk you through your options and next steps. What day/time works best for a quick call?",
  },
  direct: {
    label: "Direct",
    text: "Let's do a quick call. I'll walk you through everything. What time works for you?",
  },
};
