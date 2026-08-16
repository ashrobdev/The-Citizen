import {
  PHRASE_ALIASES,
  PLURAL_EXCEPTIONS,
  STOPWORDS,
  TOKEN_ALIASES,
  VOICE_FILLERS,
} from './aliases';
import { canonicalizeNumbers } from './numbers';

export type InputMode = 'text' | 'voice';

export interface Normalized {
  /** Full normalized string, stopwords retained. Used for exact matching. */
  text: string;
  /** Content tokens, stopwords removed. Used for set and containment matching. */
  tokens: string[];
}

/** Phrase alias keys, longest first, so "united states of america" wins over "united states". */
const PHRASE_KEYS = Object.keys(PHRASE_ALIASES).sort((a, b) => b.length - a.length);

/** Strip accents so "Ronald Reagan" and a diacritic-carrying transcript agree. */
function stripDiacritics(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/**
 * Collapse dotted and spaced initialisms: "U.S." and (in voice mode) "u s"
 * both become "us". Speech recognizers routinely emit the spaced form.
 */
function collapseInitialisms(s: string, mode: InputMode): string {
  let out = s.replace(/\b(?:[a-z]\.){2,}/g, (m) => m.replace(/\./g, ''));
  if (mode === 'voice') {
    // Two or more single letters separated by spaces -> one token.
    out = out.replace(/\b(?:[a-z] ){1,4}[a-z]\b/g, (m) => m.replace(/ /g, ''));
  }
  return out;
}

function applyPhraseAliases(s: string): string {
  let out = s;
  for (const key of PHRASE_KEYS) {
    const replacement = PHRASE_ALIASES[key];
    if (replacement === undefined) continue;
    out = out.split(key).join(replacement);
  }
  return out;
}

/**
 * Trailing-plural stripping. Conservative by design: the suffix guards cover
 * most singular-words-ending-in-s, and PLURAL_EXCEPTIONS catches the rest.
 */
function singularize(token: string): string {
  if (token.length <= 3) return token;
  if (PLURAL_EXCEPTIONS.has(token)) return token;
  if (/(?:ss|us|is|as)$/.test(token)) return token;

  // "colonies" -> "colony"
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;

  // "-es" plurals where dropping only the "s" leaves a non-word: "vetoes" ->
  // "veto", "taxes" -> "tax", "churches" -> "church". Restricted to endings
  // where this is unambiguous; "-ses" is excluded because it would turn
  // "houses" into "hous".
  if (/(?:xes|oes|ches|shes)$/.test(token) && token.length > 4) return token.slice(0, -2);

  if (token.endsWith('s')) return token.slice(0, -1);
  return token;
}

/**
 * Canonicalizes free text for comparison.
 *
 * Idempotent: normalize(normalize(x)) === normalize(x). This is asserted as a
 * property test, because a non-idempotent pipeline makes build-time variant
 * generation disagree with runtime input handling in ways that are very hard to
 * see.
 */
export function normalize(raw: string, mode: InputMode = 'text'): Normalized {
  let s = stripDiacritics(String(raw ?? ''));
  s = s.toLowerCase();

  // Curly quotes and dashes to ASCII before punctuation stripping.
  s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  s = s.replace(/[‐-―]/g, '-');

  s = collapseInitialisms(s, mode);

  // Possessives before general punctuation, so "state's" -> "state" not "states".
  s = s.replace(/'s\b/g, '');

  // Hyphens and slashes are word separators; everything else is noise.
  s = s.replace(/[-/]/g, ' ').replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();

  s = applyPhraseAliases(s);

  let tokens = s.split(' ').filter((t) => t.length > 0);

  if (mode === 'voice') {
    tokens = tokens.filter((t) => !VOICE_FILLERS.has(t));
  }

  tokens = canonicalizeNumbers(tokens);

  // Singularize BEFORE applying token aliases. The other order is not
  // idempotent: a plural whose singular happens to be an alias key survives the
  // first pass and gets rewritten on the second, so normalize(normalize(x))
  // would differ from normalize(x).
  tokens = tokens.map(singularize);
  tokens = tokens.map((t) => TOKEN_ALIASES[t] ?? t);

  return {
    text: tokens.join(' '),
    tokens: tokens.filter((t) => !STOPWORDS.has(t)),
  };
}
