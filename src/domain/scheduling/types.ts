import type { QuestionId } from '../questions/types';

/** Local calendar date as `YYYY-MM-DD`. Drives streaks only. */
export type DayKey = string;

export type SessionKind = 'daily' | 'final_test';

export type AttemptSource = 'daily' | 'final_test' | 'appeal';

/**
 * One answered question. The append-only source of truth.
 *
 * Never updated and never deleted: an appeal appends a new attempt referencing
 * the original rather than editing it. That is what makes `QuestionState` a
 * replayable projection, and what will make a future backend sync by replay
 * instead of conflict resolution.
 */
export interface Attempt {
  id: string;
  sessionId: string;
  questionId: QuestionId;
  source: AttemptSource;
  /** Epoch millis. Attempts are reduced in ascending order of this. */
  askedAt: number;
  dayKey: DayKey;
  /** Which program day the containing session was. */
  programDay: number;
  /** What the engine decided. */
  gradedCorrect: boolean;
  /** What counts, after any appeal. This is what the scheduler consumes. */
  finalCorrect: boolean;
  /** True when the user overrode the engine. Blocks mastery, see leitner.ts. */
  selfGraded: boolean;
  /** For multi-answer questions: matched / required. 1 for single answers. */
  partialRatio: number;
}

/**
 * Derived per-question scheduling state.
 *
 * A materialized projection of `Attempt[]`, never authoritative. Rebuildable at
 * any time via `reduceQuestionState`, which is what makes changing the
 * algorithm safe: bump SCHEDULER_VERSION and replay.
 */
export interface QuestionState {
  questionId: QuestionId;
  box: number;
  ease: number;
  /** Program day this question is next due. */
  dueOn: number;
  asked: number;
  correct: number;
  /** Consecutive correct answers, NOT counting self-graded ones. */
  consecCorrectStrict: number;
  lapses: number;
  firstSeenOnDay?: number;
  lastSeenOnDay?: number;
  masteredOnDay?: number;
}

export interface SchedulerContext {
  /** Completed daily sessions + 1. Drives introductions and "Day N of 90". */
  programDay: number;
  states: ReadonlyMap<QuestionId, QuestionState>;
  /** Every question available to schedule. */
  pool: readonly QuestionId[];
}
