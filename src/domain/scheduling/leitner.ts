import type { QuestionId } from '../questions/types';

import {
  BOX_INTERVALS,
  DEMOTE_HIGH_BOX_BY,
  DEMOTE_HIGH_BOX_THRESHOLD,
  EASE_DEFAULT,
  EASE_MAX,
  EASE_MIN,
  EASE_ON_CORRECT,
  EASE_ON_WRONG,
  JITTER_FRACTION,
  MASTERY_MIN_ASKED,
  MASTERY_MIN_BOX,
  MASTERY_MIN_CONSEC_STRICT,
  MAX_BOX,
  PARTIAL_CREDIT_THRESHOLD,
} from './config';
import type { QuestionState } from './types';

export function initialState(questionId: QuestionId): QuestionState {
  return {
    questionId,
    box: 0,
    ease: EASE_DEFAULT,
    dueOn: 1,
    asked: 0,
    correct: 0,
    consecCorrectStrict: 0,
    lapses: 0,
  };
}

const clampEase = (e: number): number => Math.min(EASE_MAX, Math.max(EASE_MIN, e));

/**
 * Deterministic per-question jitter in [1 - f, 1 + f].
 *
 * Spreads clumps of questions that were introduced together without
 * introducing randomness — the same question always jitters the same way, so
 * replaying the attempt log reproduces the schedule exactly.
 */
function jitter(questionId: QuestionId): number {
  const h = Math.sin(questionId * 12.9898) * 43758.5453;
  const unit = h - Math.floor(h); // 0..1
  return 1 - JITTER_FRACTION + unit * 2 * JITTER_FRACTION;
}

export function intervalFor(state: QuestionState): number {
  const base = BOX_INTERVALS[Math.min(state.box, MAX_BOX)] ?? 1;
  if (base === 0) return 0;
  return Math.max(1, Math.round(base * state.ease * jitter(state.questionId)));
}

export function isMastered(state: QuestionState): boolean {
  return (
    state.asked >= MASTERY_MIN_ASKED &&
    state.consecCorrectStrict >= MASTERY_MIN_CONSEC_STRICT &&
    state.box >= MASTERY_MIN_BOX
  );
}

export interface Grade {
  correct: boolean;
  /** Blocks strict-consecutive progress, so mastery cannot be reached by appealing. */
  selfGraded: boolean;
  /** Matched / required for multi-answer questions; 1 otherwise. */
  partialRatio: number;
  programDay: number;
}

/** Applies one answered attempt to a question's state. */
export function applyGrade(state: QuestionState, grade: Grade): QuestionState {
  const next: QuestionState = {
    ...state,
    asked: state.asked + 1,
    lastSeenOnDay: grade.programDay,
  };
  if (next.firstSeenOnDay === undefined) next.firstSeenOnDay = grade.programDay;

  if (grade.correct) {
    next.correct = state.correct + 1;
    next.box = Math.min(MAX_BOX, state.box + 1);
    next.ease = clampEase(state.ease + EASE_ON_CORRECT);
    // A self-graded correct promotes the box — the user says they knew it — but
    // does not count toward mastery, which requires unassisted recall.
    next.consecCorrectStrict = grade.selfGraded ? state.consecCorrectStrict : state.consecCorrectStrict + 1;
    next.dueOn = grade.programDay + intervalFor(next);
  } else {
    next.consecCorrectStrict = 0;
    next.lapses = state.lapses + 1;
    next.ease = clampEase(state.ease + EASE_ON_WRONG);

    if (grade.partialRatio >= PARTIAL_CREDIT_THRESHOLD) {
      // 2-of-3 is genuinely different evidence from 0-of-3.
      next.box = Math.max(0, state.box - 1);
    } else if (state.box >= DEMOTE_HIGH_BOX_THRESHOLD) {
      next.box = Math.max(0, state.box - DEMOTE_HIGH_BOX_BY);
    } else {
      next.box = 0;
    }

    // Re-queue immediately; box 0 means same-session retry.
    next.dueOn = grade.programDay;
  }

  if (next.masteredOnDay === undefined && isMastered(next)) {
    next.masteredOnDay = grade.programDay;
  }

  return next;
}

/**
 * A Final Test result under the 'demote_only' policy.
 *
 * Wrong answers demote fully — missing a question under test conditions is real
 * evidence of weakness. Correct answers update counts only: no box promotion,
 * no due-date advance. Otherwise retaking the test would empty the review queue
 * of exactly the material the user most needs to see again.
 */
export function applyFinalTestGrade(state: QuestionState, grade: Grade): QuestionState {
  if (!grade.correct) return applyGrade(state, grade);
  return {
    ...state,
    asked: state.asked + 1,
    correct: state.correct + 1,
    lastSeenOnDay: grade.programDay,
    firstSeenOnDay: state.firstSeenOnDay ?? grade.programDay,
  };
}
