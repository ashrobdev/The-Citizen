/**
 * Number-word canonicalization.
 *
 * USCIS prints numbers both ways — "Twenty-seven (27)", "Four hundred
 * thirty-five (435)" — and speech-to-text is inconsistent about which it
 * returns. Both forms must reduce to the same token or grading breaks on
 * questions whose entire answer is a number.
 *
 * Hand-written rather than pulled from a package: this needs bidirectional year
 * handling ("seventeen seventy-six" -> 1776) that generic libraries get wrong,
 * and it is small enough to test exhaustively.
 */

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Ordinal words the civics answers actually use ("Third president", "16th president"). */
const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13,
  fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17,
  eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30,
  fortieth: 40, fiftieth: 50,
};

const isUnit = (t: string): boolean => t in UNITS;
const isTen = (t: string): boolean => t in TENS;
const isNumberWord = (t: string): boolean => isUnit(t) || isTen(t);

/** "27th" / "16th" / "1st" -> the integer. */
function digitOrdinal(token: string): number | null {
  const m = /^(\d+)(st|nd|rd|th)$/.exec(token);
  return m?.[1] !== undefined ? Number(m[1]) : null;
}

interface Parsed {
  value: number;
  next: number;
}

/**
 * Parses one number phrase starting at `i`, returning its value and the index
 * after it. Returns null when `tokens[i]` does not start a number.
 */
function parseNumberPhrase(tokens: string[], i: number): Parsed | null {
  const first = tokens[i];
  if (first === undefined) return null;

  // Bare digits pass straight through, so "1776" and the spelled form agree.
  if (/^\d+$/.test(first)) return { value: Number(first), next: i + 1 };

  const ord = digitOrdinal(first);
  if (ord !== null) return { value: ord, next: i + 1 };

  if (first in ORDINALS) {
    const v = ORDINALS[first];
    if (v !== undefined) return { value: v, next: i + 1 };
  }

  if (!isNumberWord(first)) return null;

  let idx = i;
  let result = 0; // completed thousand groups
  let chunk = 0; // hundreds accumulated in the current thousand group
  let small = 0; // the sub-100 number being built
  let consumed = false;

  // English forbids a tens word after a unit: "eighteen seventy" is not one
  // number, it is a spoken year. Tracking the small-number state is what stops
  // the parser swallowing both and returning 88.
  let smallState: 'empty' | 'tens' | 'done' = 'empty';

  while (idx < tokens.length) {
    const t = tokens[idx];
    if (t === undefined) break;

    if (isUnit(t)) {
      const v = UNITS[t];
      if (v === undefined) break;
      if (smallState === 'empty') {
        small = v;
      } else if (smallState === 'tens' && v >= 1 && v <= 9) {
        small += v;
      } else {
        break; // "seventeen seventy" — second group belongs to a new phrase
      }
      smallState = 'done';
      idx++;
      consumed = true;
      continue;
    }

    if (isTen(t)) {
      const v = TENS[t];
      if (v === undefined || smallState !== 'empty') break;
      small = v;
      smallState = 'tens';
      idx++;
      consumed = true;
      continue;
    }

    if (t === 'hundred' && consumed) {
      chunk += (small === 0 ? 1 : small) * 100;
      small = 0;
      smallState = 'empty';
      idx++;
      continue;
    }

    if (t === 'thousand' && consumed) {
      result += (chunk + small === 0 ? 1 : chunk + small) * 1000;
      chunk = 0;
      small = 0;
      smallState = 'empty';
      idx++;
      continue;
    }

    // "one hundred AND five" — filler inside a number phrase, but only when a
    // number actually follows, so a trailing conjunction is left alone.
    if (t === 'and' && consumed) {
      const nextTok = tokens[idx + 1];
      if (nextTok !== undefined && isNumberWord(nextTok) && smallState !== 'done') {
        idx++;
        continue;
      }
    }

    break;
  }

  if (!consumed) return null;
  return { value: result + chunk + small, next: idx };
}

/**
 * Year idiom: two groups read as a pair, "seventeen seventy six" -> 1776.
 * Only applies when the first group is 10-99 and no scale word intervened,
 * which is exactly how spoken years differ from ordinary counts.
 */
function tryYear(tokens: string[], i: number): Parsed | null {
  const a = parseNumberPhrase(tokens, i);
  if (!a || a.value < 10 || a.value > 99) return null;

  const between = tokens[a.next];
  if (between === 'hundred' || between === 'thousand') return null;

  const b = parseNumberPhrase(tokens, a.next);
  if (!b || b.value < 0 || b.value > 99) return null;

  // Require the second group to be spelled out; "seventeen 76" is not a year idiom.
  const secondTok = tokens[a.next];
  if (secondTok === undefined || /^\d+$/.test(secondTok)) return null;

  return { value: a.value * 100 + b.value, next: b.next };
}

/**
 * Rewrites every number phrase in a token list to its digit form.
 * Non-numeric tokens pass through untouched.
 */
export function canonicalizeNumbers(tokens: string[]): string[] {
  const out: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const year = tryYear(tokens, i);
    if (year) {
      out.push(String(year.value));
      i = year.next;
      continue;
    }

    const num = parseNumberPhrase(tokens, i);
    if (num) {
      out.push(String(num.value));
      i = num.next;
      continue;
    }

    const t = tokens[i];
    if (t !== undefined) out.push(t);
    i++;
  }

  return out;
}
