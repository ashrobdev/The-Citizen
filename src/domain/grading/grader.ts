import type { AcceptedAnswer, AnswerId } from '../questions/types';

import { LEAD_INS } from './aliases';
import { editSimilarity, jaroWinkler } from './distance';
import { normalize, type InputMode } from './normalize';

/**
 * The matching cascade.
 *
 * Two failure modes, both costly and pulling in opposite directions:
 *   - too strict marks a right answer wrong, and the user loses trust and quits
 *   - too loose marks a wrong answer right, and the app fails them at a real
 *     interview
 *
 * So every stage returns a confidence, and anything short of a confident match
 * lands in `near`, which the UI turns into a one-tap appeal rather than a
 * silent verdict.
 */

export type Verdict = 'correct' | 'near' | 'incorrect';

export type MatchStage =
  | 'exact'
  | 'token-set'
  | 'containment'
  | 'fuzzy'
  | 'token-fuzzy'
  | 'none';

export interface MatchResult {
  verdict: Verdict;
  /** 0..1. Drives the verdict bands and is persisted for tuning. */
  confidence: number;
  /** Which answers the input matched. Single-answer grading yields 0 or 1. */
  matchedAnswerIds: AnswerId[];
  /** Closest answer even when incorrect, so feedback can say what was expected. */
  bestCandidateId?: AnswerId;
  stage: MatchStage;
  engineVersion: string;
}

/**
 * Bumped whenever matching behaviour changes. Persisted on every attempt so a
 * later engine can tell which verdicts came from which rules.
 */
export const ENGINE_VERSION = '1.0.0';

export const CORRECT_THRESHOLD = 0.9;
export const NEAR_THRESHOLD = 0.72;

/** Below this many characters, edit distance is too permissive to trust. */
const SHORT_STRING_LENGTH = 8;
const FUZZY_ACCEPT = 0.88;
const JARO_ACCEPT = 0.92;

function verdictFor(confidence: number): Verdict {
  if (confidence >= CORRECT_THRESHOLD) return 'correct';
  if (confidence >= NEAR_THRESHOLD) return 'near';
  return 'incorrect';
}

function containsAll(haystack: readonly string[], needles: readonly string[]): boolean {
  if (needles.length === 0) return false;
  const set = new Set(haystack);
  return needles.every((n) => set.has(n));
}

/** Every content token appearing in any variant of an answer. */
function allowedTokens(answer: AcceptedAnswer, mode: InputMode): Set<string> {
  const allowed = new Set<string>();
  for (const v of answer.variants) {
    for (const t of normalize(v, mode).tokens) allowed.add(t);
  }
  return allowed;
}

/**
 * Precision guard for the containment stage.
 *
 * Containment alone only checks recall — that the required tokens are present —
 * so a longer answer that happens to contain a shorter one matches it. That is
 * how "defend the US Constitution" (Q67) came to be accepted for "What is the
 * supreme law of the land?" (Q2).
 *
 * The fix is to also require precision: every content token the user supplied
 * must belong to the answer, or be a meaningless lead-in. Padding is tolerated,
 * new subject matter is not.
 */
function introducesNoForeignContent(
  inputTokens: readonly string[],
  answer: AcceptedAnswer,
  mode: InputMode,
): boolean {
  const allowed = allowedTokens(answer, mode);
  return inputTokens.every((t) => {
    if (allowed.has(t) || LEAD_INS.has(t)) return true;
    // A misspelling of an allowed token is not foreign content — otherwise this
    // guard would undo the typo tolerance the fuzzy stages exist to provide.
    if (t.length < 4) return false;
    for (const a of allowed) {
      if (a.length >= 4 && jaroWinkler(t, a) >= 0.9) return true;
    }
    return false;
  });
}

/** Digit tokens carry most of the meaning in answers like "16th president". */
function numericTokens(tokens: readonly string[]): string[] {
  return tokens.filter((t) => /^\d+$/.test(t));
}

/**
 * Whether two token lists disagree about numbers.
 *
 * Numbers are the highest-information tokens in this content and fuzzy matching
 * is blind to them: "1 president of the us" and "3 president of the us" are a
 * single edit apart in 21 characters, which scores 0.95.
 *
 * A number present on only one side counts as a conflict too. "First president
 * of the United States" is Washington; plain "President of the United States"
 * is the office. Treating an absent number as "no opinion" let one stand in for
 * the other.
 */
function numbersConflict(a: readonly string[], b: readonly string[]): boolean {
  return numericTokens(a).join(',') !== numericTokens(b).join(',');
}

function sameTokenSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const t of sa) if (!sb.has(t)) return false;
  return true;
}

/**
 * Fuzzy matching only compares strings of comparable length. Without this,
 * Jaro-Winkler's prefix bonus scores "liberty island" against "liberty" around
 * 0.93 — high enough to accept the Statue of Liberty's location as one of the
 * founding ideas in the Declaration.
 */
const MIN_LENGTH_RATIO = 0.7;

/** Best fuzzy similarity of `input` against any variant of one answer. */
function fuzzyScore(
  inputText: string,
  inputTokens: readonly string[],
  answer: AcceptedAnswer,
  mode: InputMode,
): number {
  let best = 0;
  for (const v of answer.variants) {
    const ratio =
      Math.min(inputText.length, v.length) / Math.max(inputText.length, v.length, 1);
    if (ratio < MIN_LENGTH_RATIO) continue;
    if (numbersConflict(inputTokens, normalize(v, mode).tokens)) continue;

    const short = v.length < SHORT_STRING_LENGTH || inputText.length < SHORT_STRING_LENGTH;
    // Jaro-Winkler for short strings: an edit budget of 1 on a 6-character
    // surname would accept a genuinely different person.
    const score = short ? jaroWinkler(inputText, v) : editSimilarity(inputText, v);
    if (score > best) best = score;
  }
  return best;
}

/** Fraction of an answer's required tokens present in the input, allowing 1 edit each. */
function tokenCoverage(inputTokens: readonly string[], required: readonly string[]): number {
  if (required.length === 0) return 0;
  let hits = 0;
  for (const need of required) {
    const found = inputTokens.some(
      (t) => t === need || (need.length >= 4 && jaroWinkler(t, need) >= 0.9),
    );
    if (found) hits++;
  }
  return hits / required.length;
}

export interface GradeOptions {
  mode?: InputMode;
}

/**
 * Grades one free-text answer against a question's accepted answers.
 *
 * `answers` is passed in rather than read off the question so that dynamic
 * questions — president, governor, your representative — can be graded through
 * exactly this cascade using answers resolved at runtime.
 */
export function gradeSingle(
  input: string,
  answers: readonly AcceptedAnswer[],
  options: GradeOptions = {},
): MatchResult {
  const mode = options.mode ?? 'text';
  const n = normalize(input, mode);

  const base = { engineVersion: ENGINE_VERSION, matchedAnswerIds: [] as AnswerId[] };

  if (n.text.length === 0 || answers.length === 0) {
    return { ...base, verdict: 'incorrect', confidence: 0, stage: 'none' };
  }

  // Stage 1 — exact match against a precomputed variant.
  for (const a of answers) {
    if (a.variants.includes(n.text)) {
      return {
        ...base,
        verdict: 'correct',
        confidence: 1,
        matchedAnswerIds: [a.id],
        bestCandidateId: a.id,
        stage: 'exact',
      };
    }
  }

  // Stage 2 — same content tokens, any order, stopwords ignored.
  for (const a of answers) {
    for (const v of a.variants) {
      if (sameTokenSet(n.tokens, normalize(v, mode).tokens)) {
        return {
          ...base,
          verdict: 'correct',
          confidence: 0.98,
          matchedAnswerIds: [a.id],
          bestCandidateId: a.id,
          stage: 'token-set',
        };
      }
    }
  }

  // Stage 3 — every required token present. Handles padding like
  // "the answer is the us constitution", and enforces compound answers.
  for (const a of answers) {
    if (containsAll(n.tokens, a.requiredTokens) && introducesNoForeignContent(n.tokens, a, mode)) {
      return {
        ...base,
        verdict: 'correct',
        confidence: 0.92,
        matchedAnswerIds: [a.id],
        bestCandidateId: a.id,
        stage: 'containment',
      };
    }
  }

  // Stage 4 — whole-string fuzzy, for typos and near-miss transcriptions.
  let bestFuzzy = 0;
  let bestFuzzyId: AnswerId | undefined;
  for (const a of answers) {
    const score = fuzzyScore(n.text, n.tokens, a, mode);
    if (score > bestFuzzy) {
      bestFuzzy = score;
      bestFuzzyId = a.id;
    }
  }

  const fuzzyBar = n.text.length < SHORT_STRING_LENGTH ? JARO_ACCEPT : FUZZY_ACCEPT;
  if (bestFuzzyId !== undefined && bestFuzzy >= fuzzyBar) {
    return {
      ...base,
      verdict: 'correct',
      confidence: Math.min(0.96, bestFuzzy),
      matchedAnswerIds: [bestFuzzyId],
      bestCandidateId: bestFuzzyId,
      stage: 'fuzzy',
    };
  }

  // Stage 5 — per-token coverage, i.e. containment that tolerates a typo in
  // each token. It carries the SAME precision requirement as stage 3: full
  // coverage of a short answer's tokens is meaningless if the user also said a
  // pile of other things, which is how a longer answer to a different question
  // slips through.
  let bestCoverage = 0;
  let bestCoverageId: AnswerId | undefined;
  let bestCleanCoverage = 0;
  let bestCleanCoverageId: AnswerId | undefined;

  for (const a of answers) {
    const cov = tokenCoverage(n.tokens, a.requiredTokens);
    if (cov > bestCoverage) {
      bestCoverage = cov;
      bestCoverageId = a.id;
    }
    if (cov > bestCleanCoverage && introducesNoForeignContent(n.tokens, a, mode)) {
      bestCleanCoverage = cov;
      bestCleanCoverageId = a.id;
    }
  }

  if (bestCleanCoverage >= 0.999 && bestCleanCoverageId !== undefined) {
    // Every required token present modulo a typo, and nothing foreign added.
    return {
      ...base,
      verdict: 'correct',
      confidence: 0.9,
      matchedAnswerIds: [bestCleanCoverageId],
      bestCandidateId: bestCleanCoverageId,
      stage: 'token-fuzzy',
    };
  }

  const candidate = bestFuzzy >= bestCoverage ? bestFuzzyId : bestCoverageId;
  const confidence = Math.max(bestFuzzy, bestCoverage * 0.85);
  const verdict = verdictFor(confidence);

  const result: MatchResult = {
    ...base,
    verdict: verdict === 'correct' ? 'near' : verdict, // stage 5 cannot award correct
    confidence,
    stage: confidence >= NEAR_THRESHOLD ? 'token-fuzzy' : 'none',
  };
  if (candidate !== undefined) result.bestCandidateId = candidate;
  return result;
}
