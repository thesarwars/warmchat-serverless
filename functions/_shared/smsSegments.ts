/**
 * GSM-7 segment counting + length guard.
 * Returns an error string if the message would exceed the SMS segment cap,
 * otherwise null. Used by the automation create + send endpoints before we
 * hit Telnyx with something that will silently truncate.
 */

const GSM7_BASE = new Set([
  "@", "£", "$", "¥", "è", "é", "ù", "ì", "ò", "Ç", "\n", "Ø", "ø", "\r", "Å", "å",
  "Δ", "_", "Φ", "Γ", "Λ", "Ω", "Π", "Ψ", "Σ", "Θ", "Ξ", "Æ", "æ", "ß", "É",
  " ", "!", "\"", "#", "¤", "%", "&", "'", "(", ")", "*", "+", ",", "-", ".", "/",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ":", ";", "<", "=", ">", "?",
  "¡", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O",
  "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "Ä", "Ö", "Ñ", "Ü", "§",
  "¿", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o",
  "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "ä", "ö", "ñ", "ü", "à",
]);
const GSM7_EXT = new Set(["\f", "^", "{", "}", "\\", "[", "~", "]", "|", "€"]);

const MAX_SEGMENTS = 5;

export interface SegmentInfo { encoding: "gsm" | "ucs2"; chars: number; segments: number }

export function smsSegmentInfo(message: string): SegmentInfo {
  let isGsm = true;
  let chars = 0;
  for (const ch of message) {
    if (GSM7_BASE.has(ch)) chars += 1;
    else if (GSM7_EXT.has(ch)) chars += 2;
    else { isGsm = false; break; }
  }
  if (isGsm) {
    const segLen = chars <= 160 ? 160 : 153;
    return { encoding: "gsm", chars, segments: Math.max(1, Math.ceil(chars / segLen)) };
  }
  const ucs2Chars = [...message].length;
  const segLen = ucs2Chars <= 70 ? 70 : 67;
  return { encoding: "ucs2", chars: ucs2Chars, segments: Math.max(1, Math.ceil(ucs2Chars / segLen)) };
}

export function smsSegmentError(message: string): string | null {
  if (!message || !message.trim()) return null;
  const info = smsSegmentInfo(message);
  if (info.segments > MAX_SEGMENTS) {
    return `Message is too long (${info.segments} SMS segments - max ${MAX_SEGMENTS}). Trim it or split the automation.`;
  }
  return null;
}
