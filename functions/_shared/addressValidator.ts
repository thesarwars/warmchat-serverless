/**
 * Server-side validator for the agent's CAN-SPAM business address.
 *
 * Returns null when the address is acceptable, or a human-readable reason
 * string when it isn't. Pairs with the matching client-side helper in
 * src/utils/addressValidator.ts - if you change one, change both so the
 * UI feedback and the server's final say agree.
 *
 * Intentionally permissive (US-focused, since the CRM ships to US realtors)
 * while still rejecting obvious junk like "asdf", "test", "blah blah text".
 * Real validation against a postal database (USPS, Google Places) would be
 * better; this is the cheap "must look like a real address" floor.
 *
 * Required:
 *   - Length >= 15 chars after trimming
 *   - At least one street-number digit run + a letter (street-name shape)
 *   - A US state code (2 letters) or full US state name
 *   - A 5-digit ZIP, optionally with +4 (e.g. 12345 or 12345-6789)
 *   - At least one comma (separates street / city / state) - the strictest
 *     hint that someone actually formatted an address
 */

const STATE_CODES_RE = /\b(A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/i;

const STATE_NAMES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut",
  "Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa",
  "Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan",
  "Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire",
  "New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio",
  "Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota",
  "Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia",
  "Wisconsin","Wyoming","District of Columbia",
];

const STATE_NAMES_RE = new RegExp(`\\b(${STATE_NAMES.join("|")})\\b`, "i");

const ZIP_RE = /\b\d{5}(-\d{4})?\b/;

const STREET_RE = /\b\d+\s+[A-Za-z]/; // "123 Main", "45 Oak", etc.

export function validateBusinessAddress(raw: string): string | null {
  const v = (raw || "").trim();
  if (!v) return "Business mailing address is required.";
  if (v.length < 15) {
    return "Address looks too short - include street number, street, city, state, and ZIP.";
  }
  if (!STREET_RE.test(v)) {
    return "Address must include a street number followed by a street name (e.g. \"123 Main St\").";
  }
  if (!ZIP_RE.test(v)) {
    return "Address must include a 5-digit US ZIP code (e.g. 62701 or 62701-1234).";
  }
  if (!STATE_CODES_RE.test(v) && !STATE_NAMES_RE.test(v)) {
    return "Address must include a US state (e.g. \"IL\" or \"Illinois\").";
  }
  if (!/,/.test(v)) {
    return "Use commas to separate street, city, and state (e.g. \"123 Main St, Springfield, IL 62701\").";
  }
  // Reject obvious junk like all-same-letter or single-word with appended digits.
  if (/^(.)\1{5,}$/.test(v.replace(/\s/g, ""))) {
    return "Address looks like placeholder text.";
  }
  return null;
}
