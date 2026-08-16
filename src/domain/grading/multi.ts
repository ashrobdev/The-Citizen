import type { AcceptedAnswer, AnswerId } from '../questions/types';

import { ENGINE_VERSION, gradeSingle, type Verdict } from './grader';
import type { InputMode } from './normalize';

/**
 * Grading for the seven questions that ask for more than one answer:
 * Q10 (2), Q48 (2 of 22), Q65 (3), Q67 (2), Q69 (2), Q81 (5 of 13), Q126 (3).
 *
 * This is an assignment problem, not a sequence of independent comparisons.
 * Each accepted answer may be consumed once, which is what stops
 * "Washington, Washington, Washington" counting as three of the thirteen
 * original states.
 */

export interface MultiResult {
  verdict: Verdict;
  matchedAnswerIds: AnswerId[];
  matchedCount: number;
  requiredCount: number;
  /** matchedCount / requiredCount, persisted to soften the Leitner demotion. */
  partialRatio: number;
  /** Segments that matched nothing, shown back to the user in feedback. */
  unmatchedSegments: string[];
  engineVersion: string;
}

/**
 * Splits one free-text response into candidate answers.
 *
 * The whole string is always kept as an additional candidate, because several
 * accepted answers legitimately contain a separator — "Legislative, executive,
 * and judicial" is one answer, not three.
 */
export function segmentAnswers(input: string): string[] {
  const parts = input
    .split(/\s*[,;\n]\s*|\s+\band\b\s+|\s+\balso\b\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return parts.length > 1 ? parts : [input.trim()].filter((s) => s.length > 0);
}

interface Pairing {
  segmentIndex: number;
  answerId: AnswerId;
  confidence: number;
}

/**
 * Grades N distinct answers against a pool.
 *
 * `segments` may come from separate input fields (text mode) or from splitting
 * a single utterance (voice mode).
 */
export function gradeMulti(
  segments: readonly string[],
  pool: readonly AcceptedAnswer[],
  requiredCount: number,
  options: { mode?: InputMode } = {},
): MultiResult {
  const mode = options.mode ?? 'text';
  const cleaned = segments.map((s) => s.trim()).filter((s) => s.length > 0);

  const base = {
    requiredCount,
    engineVersion: ENGINE_VERSION,
  };

  if (cleaned.length === 0 || pool.length === 0) {
    return {
      ...base,
      verdict: 'incorrect',
      matchedAnswerIds: [],
      matchedCount: 0,
      partialRatio: 0,
      unmatchedSegments: [...cleaned],
    };
  }

  // Score every segment against every pool answer, then assign greedily by
  // descending confidence. Greedy is optimal enough here: pools are small and
  // a segment rarely scores high against more than one answer.
  const pairings: Pairing[] = [];
  cleaned.forEach((segment, segmentIndex) => {
    for (const answer of pool) {
      const r = gradeSingle(segment, [answer], { mode });
      if (r.verdict === 'correct') {
        pairings.push({ segmentIndex, answerId: answer.id, confidence: r.confidence });
      }
    }
  });

  pairings.sort((a, b) => b.confidence - a.confidence);

  const usedSegments = new Set<number>();
  const usedAnswers = new Set<AnswerId>();
  const matchedAnswerIds: AnswerId[] = [];

  for (const p of pairings) {
    if (usedSegments.has(p.segmentIndex) || usedAnswers.has(p.answerId)) continue;
    usedSegments.add(p.segmentIndex);
    usedAnswers.add(p.answerId);
    matchedAnswerIds.push(p.answerId);
  }

  const matchedCount = matchedAnswerIds.length;
  const partialRatio = requiredCount === 0 ? 0 : Math.min(1, matchedCount / requiredCount);

  const unmatchedSegments = cleaned.filter((_, i) => !usedSegments.has(i));

  let verdict: Verdict;
  if (matchedCount >= requiredCount) {
    verdict = 'correct';
  } else if (partialRatio >= 0.5) {
    verdict = 'near';
  } else {
    verdict = 'incorrect';
  }

  return {
    ...base,
    verdict,
    matchedAnswerIds,
    matchedCount,
    partialRatio,
    unmatchedSegments,
  };
}
