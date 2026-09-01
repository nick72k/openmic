/** Text prep shared by speakers. Agents emit smart quotes, dashes and emoji; Piper wants plain ASCII. */

const SMART_TO_PLAIN: ReadonlyArray<[RegExp, string]> = [
  [/[‘’‚‛]/g, "'"],
  [/[“”„‟]/g, '"'],
  [/…/g, '...'],
  [/\s*[—–]\s*/g, ', '], // em/en dash read as a pause
];

/** Emoji, symbols and control characters the phonemizer has no business seeing. */
const UNSPEAKABLE = /[\p{Extended_Pictographic}\p{Cc}\p{Cf}️]/gu;

const SENTENCE = /[^.!?]+[.!?]*["')\]]*\s*/g; // closing quotes stay with their sentence

/** Playback watchdog: generous per-character pace plus a floor for short lines. */
const BUDGET_FLOOR_MS = 4_000;
const BUDGET_PER_CHAR_MS = 110;

export function sanitizeForTts(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SMART_TO_PLAIN) {
    out = out.replace(pattern, replacement);
  }
  // Unspeakables become spaces (so newlines and emoji don't glue words), then collapse.
  return out.replace(UNSPEAKABLE, ' ').replace(/\s+/g, ' ').trim();
}

export function splitSentences(text: string): string[] {
  return (text.match(SENTENCE) ?? []).map((s) => s.trim()).filter(Boolean);
}

/** Upper bound on how long speaking `text` may take before the show moves on. */
export function speechBudgetMs(text: string): number {
  return BUDGET_FLOOR_MS + text.length * BUDGET_PER_CHAR_MS;
}
