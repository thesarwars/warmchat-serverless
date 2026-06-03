/**
 * Client-side mirror of functions/_shared/addressValidator.ts.
 *
 * Returns null when acceptable, else a user-facing reason string. The server
 * runs the same logic on PUT /api/profile/me so a tampered client can't
 * sneak placeholder text through.
 *
 * Keep in sync with the server file.
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
const STREET_RE = /\b\d+\s+[A-Za-z]/;

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
  if (/^(.)\1{5,}$/.test(v.replace(/\s/g, ""))) {
    return "Address looks like placeholder text.";
  }
  return null;
}
