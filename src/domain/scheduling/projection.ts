import type { QuestionId } from '../questions/types';

import { FINAL_TEST_FEEDBACK } from './config';
import { applyFinalTestGrade, applyGrade, initialState } from './leitner';
import type { Attempt, QuestionState } from './types';

/**
 * Rebuilds scheduling state from the append-only attempt log.
 *
 * This is the keystone of the whole data design. Because the reducer is pure
 * and the log is append-only:
 *
 *  - changing the algorithm is safe — bump SCHEDULER_VERSION and replay
 *  - the simulation harness and production run the SAME code
 *  - a future backend syncs by replaying appended attempts, so conflicts
 *    largely stop existing
 */
export function reduceQuestionState(
  questionId: QuestionId,
  attempts: readonly Attempt[],
): QuestionState {
  const ordered = [...attempts]
    .filter((a) => a.questionId === questionId)
    .sort((a, b) => a.askedAt - b.askedAt);

  let state = initialState(questionId);

  for (const attempt of ordered) {
    // Appeals are appended as new attempts referencing the original; the
    // original already contributed, so only the corrected verdict is replayed.
    const grade = {
      correct: attempt.finalCorrect,
      selfGraded: attempt.selfGraded,
      partialRatio: attempt.partialRatio,
      programDay: attempt.programDay,
    };

    if (attempt.source === 'final_test') {
      if (FINAL_TEST_FEEDBACK === 'none') continue;
      state =
        FINAL_TEST_FEEDBACK === 'full'
          ? applyGrade(state, grade)
          : applyFinalTestGrade(state, grade);
      continue;
    }

    state = applyGrade(state, grade);
  }

  return state;
}

/** Rebuilds every question's state in one pass over the log. */
export function rebuildAllStates(
  pool: readonly QuestionId[],
  attempts: readonly Attempt[],
): Map<QuestionId, QuestionState> {
  const byQuestion = new Map<QuestionId, Attempt[]>();
  for (const a of attempts) {
    const list = byQuestion.get(a.questionId);
    if (list) list.push(a);
    else byQuestion.set(a.questionId, [a]);
  }

  const out = new Map<QuestionId, QuestionState>();
  for (const id of pool) {
    out.set(id, reduceQuestionState(id, byQuestion.get(id) ?? []));
  }
  return out;
}
