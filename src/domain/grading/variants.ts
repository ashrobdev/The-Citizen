import { normalize } from './normalize';
import { STOPWORDS } from './aliases';

/**
 * USCIS answer strings carry a small implicit grammar:
 *
 *   "(U.S.) Constitution"            parenthetical is optional
 *   "(Battle of) Bunker Hill"        optional prefix
 *   "on the Hudson (River)"          optional suffix
 *   "Twenty-seven (27)"              the same value written two ways
 *   "Boston Tea Party (Tea Act)"     an alternative name
 *   "Liberty Island [Also acceptable are ...]"   editorial note, NOT an answer
 *
 * Every parenthetical is treated as optional, which is the safe reading: it
 * produces both the long and short form, and both are accepted. Alternatives
 * fall out of the same rule because dropping the parenthetical leaves the base
 * name and keeping it leaves a string the number/alias layers already fold.
 *
 * Square brackets are never parsed as answers. See `extractNote`.
 */

/** Expansion is capped so a pathological answer cannot explode the bank. */
export const MAX_VARIANTS = 32;

export interface ParsedAnswer {
  /** Answer text with any bracketed note removed. */
  matchable: string;
  /** The bracketed editorial note, if present. */
  note?: string;
}

/** Splits the USCIS editorial note out of an answer string. */
export function extractNote(display: string): ParsedAnswer {
  const m = /\[([^\]]*)\]/.exec(display);
  if (!m) return { matchable: display.trim() };
  const note = (m[1] ?? '').trim();
  const matchable = display.replace(m[0], '').replace(/\s+/g, ' ').trim();
  return note.length > 0 ? { matchable, note } : { matchable };
}

/**
 * True when a note announces further acceptable answers. Those must be
 * hand-curated rather than machine-parsed — silently mis-reading
 * "Also acceptable are New Jersey, near New York City, and on the Hudson"
 * would produce invisible wrong grading, so the import fails instead.
 */
export function noteDeclaresMoreAnswers(note: string | undefined): boolean {
  return note !== undefined && /acceptable/i.test(note);
}

/**
 * Removes parentheticals that merely restate what precedes them.
 *
 * "Twenty-seven (27)" is one value written twice, not two alternatives: both
 * halves normalize to "27", so keeping the group would emit a nonsense
 * "27 27" variant. "Boston Tea Party (Tea Act)" survives, because the inner
 * text normalizes differently and is a genuine alternative name.
 */
function collapseRestatements(s: string): string {
  let out = s;
  let searchFrom = 0;

  for (;;) {
    const re = /\(([^)]*)\)/g;
    re.lastIndex = searchFrom;
    const m = re.exec(out);
    if (!m || m.index === undefined) break;

    const inner = normalize(m[1] ?? '').text;
    const before = normalize(out.slice(0, m.index)).text;

    if (inner.length > 0 && inner === before) {
      out = (out.slice(0, m.index) + out.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
      searchFrom = 0;
      continue;
    }
    searchFrom = m.index + m[0].length;
  }

  return out;
}

/** Every combination of keeping or dropping each parenthetical group. */
function expandParentheticals(input: string): string[] {
  const s = collapseRestatements(input);
  const groups = [...s.matchAll(/\(([^)]*)\)/g)];
  if (groups.length === 0) return [s];

  // 2^n combinations, but n is 1 or 2 in practice.
  const combos = 1 << groups.length;
  const out: string[] = [];

  for (let mask = 0; mask < combos; mask++) {
    let result = s;
    // Replace right-to-left so earlier match indexes stay valid.
    for (let g = groups.length - 1; g >= 0; g--) {
      const group = groups[g];
      if (group?.index === undefined) continue;
      const keep = (mask & (1 << g)) !== 0;
      const inner = group[1] ?? '';
      const replacement = keep ? inner : '';
      result =
        result.slice(0, group.index) + replacement + result.slice(group.index + group[0].length);
    }
    out.push(result.replace(/\s+/g, ' ').trim());
  }

  return out;
}

/**
 * Words that mark a parenthetical as a MODIFIER of what precedes it rather than
 * an alternative name for it. "(of the United States)" qualifies "President";
 * "(Defense)" renames "Secretary of War".
 */
const MODIFIER_OPENERS = new Set([
  'of', 'for', 'if', 'in', 'on', 'under', 'from', 'at', 'to', 'with', 'by',
  'about', 'during', 'before', 'after', 'as', 'and', 'or', 'when', 'while',
  'because', 'so', 'that', 'than', 'until',
]);

/**
 * The alternative-name reading: USCIS uses a trailing parenthetical both to
 * qualify an answer and to give it a second name. "Secretary of War (Defense)"
 * means "Secretary of Defense" is acceptable, and "Freed the slaves
 * (Emancipation Proclamation)" means naming the proclamation is acceptable.
 *
 * A parenthetical opening with a preposition is a modifier and yields nothing
 * on its own — "of the United States" is not an answer to anything.
 */
function standaloneParentheticals(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(/\(([^)]*)\)/g)) {
    const inner = (m[1] ?? '').trim();
    if (inner.length === 0) continue;

    const n = normalize(inner);
    const first = n.text.split(' ')[0];
    if (first === undefined || first.length === 0) continue;
    if (MODIFIER_OPENERS.has(first)) continue;

    // Require a multi-word phrase or a number. A single bare word is almost
    // always a modifier rather than a name — "(congressional)" in "Citizens in
    // their (congressional) district" and "(American)" in "The (American)
    // Revolutionary War" would otherwise become answers in their own right,
    // and "congressional" would then be accepted for "What part of the federal
    // government writes laws?".
    //
    // The genuine one-word alternatives are few enough to name explicitly in
    // data/manual/answer-overrides.json, where they can be reviewed.
    const isNumber = /^\d+$/.test(n.text);
    if (n.tokens.length < 2 && !isNumber) continue;

    out.push(inner);
  }
  return out;
}

/**
 * Build-time variant generation. Returns normalized, deduped, non-empty forms.
 */
export function buildVariants(display: string): string[] {
  const { matchable } = extractNote(display);
  const collapsed = collapseRestatements(matchable);
  const raw = [...expandParentheticals(matchable), ...standaloneParentheticals(collapsed)];

  const seen = new Set<string>();
  for (const form of raw) {
    const n = normalize(form).text;
    if (n.length > 0) seen.add(n);
  }

  const variants = [...seen].sort();
  if (variants.length > MAX_VARIANTS) {
    throw new Error(
      `Answer "${display}" expanded to ${variants.length} variants (max ${MAX_VARIANTS})`,
    );
  }
  return variants;
}

/**
 * Content tokens that must all appear for a containment match.
 *
 * Taken from the SHORTEST variant — the form with every optional parenthetical
 * dropped. That is precisely the irreducible core of the answer: for
 * "(Battle of) Bunker Hill" it is "bunker hill", so a user who says only
 * "Battle of" fails while one who says either full form passes.
 *
 * This is also what enforces the two compound answers. Q16's
 * "Legislative, executive, and judicial" has no parentheses, so all three
 * branch names are required and naming one is incomplete.
 */
export function buildRequiredTokens(display: string): string[] {
  const { matchable } = extractNote(display);
  const forms = expandParentheticals(matchable)
    .map((f) => normalize(f).tokens)
    .filter((t) => t.length > 0);

  if (forms.length === 0) return [];

  let shortest = forms[0];
  if (shortest === undefined) return [];
  for (const f of forms) {
    if (f.length < shortest.length) shortest = f;
  }

  return [...new Set(shortest)].filter((t) => !STOPWORDS.has(t));
}
