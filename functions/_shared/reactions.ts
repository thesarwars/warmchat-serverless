/// <reference types="@cloudflare/workers-types" />
/**
 * Detect "reaction-only" inbound messages: a bare emoji (heart, thumbs-up, etc.)
 * or an SMS Tapback that arrives as text on Android/RCS/SMS ("Liked ...",
 * "Loved ...", "Reacted X to ..."). These are acknowledgements, not real replies
 * - the AI must NOT reply, create a task, or mark the thread "Needs Reply"; we
 * only log them in history. Any emoji accompanied by real text is a normal
 * message and is processed as usual.
 */

// iOS Tapbacks relayed to non-iMessage recipients come through as English text:
//   Liked / Loved / Laughed at / Emphasized / Disliked / Questioned "<quoted>"
// The quote class allows a straight (") or curly (“ ”) double quote.
const TAPBACK_RX =
  /^(?:liked|loved|laughed at|emphasi[sz]ed|disliked|questioned)\s+["“].*["”]\s*$/i;
// Google Messages / RCS style: Reacted <emoji> to "..." / Reacted with X to "..."
const REACTED_RX = /^reacted\b.*\bto\s+["“].*["”]\s*$/i;

// Emoji + the combining/modifier code points that decorate them: skin-tone
// modifiers (1F3FB-1F3FF), variation selector (FE0F), ZWJ (200D), keycap
// combiner (20E3), gender signs (2640/2642), plus whitespace. Plain
// letters/digits are NOT stripped, so "ok <thumbs-up>" or "3" stay normal text.
const EMOJI_DECOR =
  /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}️‍⃣♀♂\s]/gu;
const HAS_PICTOGRAPH = /\p{Extended_Pictographic}/u;

/** True when the message is only an emoji reaction or an SMS Tapback. */
export function isReactionOnly(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (TAPBACK_RX.test(t) || REACTED_RX.test(t)) return true;
  // Emoji-only: everything left after removing emoji + decorations is blank.
  if (!HAS_PICTOGRAPH.test(t)) return false;
  return t.replace(EMOJI_DECOR, "").length === 0;
}
