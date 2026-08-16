import type { QuestionId } from '../questions/types';

import { DAILY_QUESTION_COUNT, INTRODUCTION_CURVE, MAX_LAPSED_PER_DAY } from './config';
import { isMastered } from './leitner';
import type { QuestionState, SchedulerContext } from './types';

/** New questions allowed on this program day, per the introduction curve. */
export function newQuestionsAllowed(programDay: number): number {
  for (const step of INTRODUCTION_CURVE) {
    if (programDay <= step.throughProgramDay) return step.newPerDay;
  }
  return 0;
}

const isUnseen = (s: QuestionState): boolean => s.asked === 0;

/**
 * Picks the day's questions.
 *
 * Priority order:
 *   1. lapsed and overdue — capped, so one bad day cannot crowd out everything
 *   2. due reviews
 *   3. new introductions, subject to the curve and the backlog valve
 *   4. filler, weakest first
 *
 * Deterministic: the same context always yields the same list, and the result
 * is persisted to the session so reopening mid-session never reshuffles.
 */
export function selectDailyQuestions(
  ctx: SchedulerContext,
  count = DAILY_QUESTION_COUNT,
): QuestionId[] {
  const { programDay, states, pool } = ctx;

  const stateOf = (id: QuestionId): QuestionState | undefined => states.get(id);
  const chosen: QuestionId[] = [];
  const taken = new Set<QuestionId>();

  const take = (ids: readonly QuestionId[], limit: number): void => {
    for (const id of ids) {
      if (chosen.length >= count) return;
      if (limit <= 0) return;
      if (taken.has(id)) continue;
      taken.add(id);
      chosen.push(id);
      limit--;
    }
  };

  const seen = pool.filter((id) => {
    const s = stateOf(id);
    return s !== undefined && !isUnseen(s);
  });

  const unseen = pool
    .filter((id) => {
      const s = stateOf(id);
      return s === undefined || isUnseen(s);
    })
    .sort((a, b) => a - b);

  /**
   * Introduction slots are RESERVED before reviews are taken, not left over.
   *
   * Reviews will always fill twelve slots once a learner has a backlog, so
   * treating introductions as the lowest priority silently starved them: a
   * struggling learner reached day 120 having never seen 50 of the 128
   * questions. Since the daily workload is fixed at twelve either way,
   * deferring an introduction does not reduce the user's effort — it only
   * delays coverage of material they must know before test day.
   */
  const introductionSlots = Math.min(unseen.length, newQuestionsAllowed(programDay));
  const reviewBudget = Math.max(0, count - introductionSlots);

  // 1. Lapsed: low box and overdue. Most overdue and weakest first.
  const lapsed = seen
    .filter((id) => {
      const s = stateOf(id);
      return s !== undefined && s.box <= 1 && s.dueOn <= programDay;
    })
    .sort((a, b) => {
      const sa = stateOf(a);
      const sb = stateOf(b);
      return (sa?.box ?? 0) - (sb?.box ?? 0) || (sa?.dueOn ?? 0) - (sb?.dueOn ?? 0) || a - b;
    });
  take(lapsed, Math.min(MAX_LAPSED_PER_DAY, reviewBudget));

  // 2. Everything else that is due.
  const due = seen
    .filter((id) => {
      const s = stateOf(id);
      return s !== undefined && s.dueOn <= programDay;
    })
    .sort((a, b) => {
      const sa = stateOf(a);
      const sb = stateOf(b);
      return (sa?.dueOn ?? 0) - (sb?.dueOn ?? 0) || (sa?.box ?? 0) - (sb?.box ?? 0) || a - b;
    });
  take(due, Math.max(0, reviewBudget - chosen.length));

  // 3. New material, in USCIS numeric order — thematically coherent, and it
  // matches how people index the study guide ("I'm on questions 1 to 24").
  take(unseen, introductionSlots);

  // 4. Filler. By roughly day 55-65 a diligent user has little genuinely due,
  // so this rule carries most of the late programme — it must reach for the
  // weakest material, not just the soonest.
  if (chosen.length < count) {
    const filler = pool
      .filter((id) => !taken.has(id))
      .sort((a, b) => {
        const sa = stateOf(a);
        const sb = stateOf(b);
        if (sa === undefined || sb === undefined) return a - b;

        const masteredA = isMastered(sa) ? 1 : 0;
        const masteredB = isMastered(sb) ? 1 : 0;
        if (masteredA !== masteredB) return masteredA - masteredB;

        const accuracyA = sa.asked === 0 ? 0 : sa.correct / sa.asked;
        const accuracyB = sb.asked === 0 ? 0 : sb.correct / sb.asked;

        return (
          sa.box - sb.box ||
          accuracyA - accuracyB ||
          (sa.lastSeenOnDay ?? 0) - (sb.lastSeenOnDay ?? 0) ||
          a - b
        );
      });
    take(filler, count);
  }

  return chosen;
}
