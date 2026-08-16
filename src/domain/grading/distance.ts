/**
 * String distance metrics for the fuzzy matching stage.
 *
 * Hand-written rather than pulled from a package: both are small, the exact
 * variants matter (Damerau's transposition case is common in typing, and
 * Jaro-Winkler's prefix bonus is what makes it right for short proper nouns),
 * and a grading engine should not have a supply-chain dependency for 80 lines
 * of arithmetic.
 */

/**
 * Damerau-Levenshtein with adjacent transpositions.
 *
 * Transposition matters here because "Consitution" and "Constituion" are the
 * two typos people actually make, and plain Levenshtein charges 2 for a swap.
 */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Two rolling rows plus the row before them, for the transposition case.
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr: number[] = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        (curr[j - 1] ?? 0) + 1, // insertion
        (prev[j] ?? 0) + 1, // deletion
        (prev[j - 1] ?? 0) + cost, // substitution
      );

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (prev2[j - 2] ?? 0) + 1); // transposition
      }
      curr[j] = value;
    }
    prev2 = prev;
    prev = curr;
    curr = new Array<number>(b.length + 1).fill(0);
  }

  return prev[b.length] ?? 0;
}

/** Jaro similarity, 0..1. */
function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aFlags = new Array<boolean>(a.length).fill(false);
  const bFlags = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bFlags[j] || a[i] !== b[j]) continue;
      aFlags[i] = true;
      bFlags[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aFlags[i]) continue;
    while (!bFlags[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  transpositions /= 2;

  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
}

/**
 * Jaro-Winkler, 0..1. The shared-prefix bonus is why this is used for short
 * proper nouns, where Levenshtein's edit budget is too permissive: at 6
 * characters a budget of 1 edit would accept genuinely different surnames.
 */
export function jaroWinkler(a: string, b: string, prefixScale = 0.1): number {
  const j = jaro(a, b);
  if (j < 0.7) return j; // Winkler's own threshold: don't boost poor matches

  let prefix = 0;
  const max = Math.min(4, a.length, b.length);
  while (prefix < max && a[prefix] === b[prefix]) prefix++;

  return j + prefix * prefixScale * (1 - j);
}

/**
 * Normalized similarity from Damerau-Levenshtein, 0..1.
 */
export function editSimilarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - damerauLevenshtein(a, b) / longest;
}
