/**
 * Strip the "AI tell" em-dash out of generated copy. Agents have flagged that
 * em-dashes (—), en-dashes (–) and a spaced hyphen used as a dash (" - ") read
 * as ChatGPT-written; real people use commas. This converts those to commas
 * while LEAVING intra-word and intra-number hyphens intact, so:
 *   - "Hi John — still looking?"      -> "Hi John, still looking?"
 *   - "homes in LA - want a look?"    -> "homes in LA, want a look?"
 *   - "top-producing", "follow-up"    -> unchanged (no surrounding spaces)
 *   - "747-324-2077", "$300k-$400k"   -> unchanged (no surrounding spaces)
 *
 * Applied to AI-generated MESSAGE text only (never to JSON/structured output).
 */
export function humanizeDashes(input: string): string {
  if (!input) return input;
  let s = input;
  // em / en dash (with any surrounding whitespace) -> comma + space
  s = s.replace(/\s*[—–]\s*/g, ", ");
  // hyphen(s) used AS a dash: must be space-padded on BOTH sides so word/number
  // hyphens (top-producing, 747-324-2077) are untouched.
  s = s.replace(/ +-+ +/g, ", ");
  // tidy-ups from the swap:
  s = s.replace(/\s+,/g, ",");              // " ," -> ","
  s = s.replace(/,\s*([,.;:!?])/g, "$1");   // ", ." -> "."   ", ," -> ","
  s = s.replace(/,{2,}/g, ",");             // ",," -> ","
  s = s.replace(/[ \t]{2,}/g, " ");         // collapse double spaces
  return s.trim();
}
