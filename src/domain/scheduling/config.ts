/**
 * Every scheduling constant lives here so the simulation tests read them rather
 * than hardcoding, and so tuning is one file rather than a hunt.
 */

/** Questions delivered per daily session. */
export const DAILY_QUESTION_COUNT = 12;

/** Nominal programme length. Not an expiry — see maintenance mode. */
export const PROGRAM_LENGTH_DAYS = 90;

/**
 * Leitner intervals in days, indexed by box. Box 0 is same-session retry.
 * 1080 daily slots over 90 days for 128 questions is ~8.4 exposures each, and
 * these intervals spend that budget on the questions still being missed.
 */
export const BOX_INTERVALS = [0, 1, 2, 4, 8, 16, 32] as const;
export const MAX_BOX = BOX_INTERVALS.length - 1;

export const EASE_DEFAULT = 1.0;
export const EASE_MIN = 0.6;
export const EASE_MAX = 1.3;
export const EASE_ON_CORRECT = 0.05;
export const EASE_ON_WRONG = -0.15;

/** Mastery requires repeated, unassisted success — not one lucky answer. */
export const MASTERY_MIN_ASKED = 4;
export const MASTERY_MIN_CONSEC_STRICT = 3;
export const MASTERY_MIN_BOX = 5;

/**
 * A wrong answer on a well-known question drops two boxes rather than resetting
 * to zero: civics facts are memorization, but a single slip on something
 * answered right four times running is not the same as never having known it.
 */
export const DEMOTE_HIGH_BOX_BY = 2;
export const DEMOTE_HIGH_BOX_THRESHOLD = 4;

/** A multi-answer question half-right demotes more gently. 2-of-3 is real partial knowledge. */
export const PARTIAL_CREDIT_THRESHOLD = 0.5;

/**
 * How many never-seen questions to introduce per program day.
 *
 * Front-loaded so all 128 are introduced by program day 20, comfortably inside
 * the 30-day target, leaving buffer for the backlog valve below. Days 1-2 are
 * necessarily all-new because there is nothing to review yet.
 */
export const INTRODUCTION_CURVE: readonly {
  throughProgramDay: number;
  newPerDay: number;
}[] = [
  { throughProgramDay: 2, newPerDay: 12 }, // 24
  { throughProgramDay: 6, newPerDay: 8 }, // +32 = 56
  { throughProgramDay: 14, newPerDay: 6 }, // +48 = 104
  { throughProgramDay: 20, newPerDay: 4 }, // +24 = 128
];

// A backlog valve that suppressed introductions was tried and removed: the
// daily workload is a fixed twelve either way, so deferring new material does
// not lighten the load, it only delays coverage. Simulation showed a struggling
// learner reaching day 120 having never seen 50 of the 128 questions.

/**
 * Cap on lapsed questions in one session, so a single bad day cannot fill the
 * whole session and stall introductions indefinitely.
 */
export const MAX_LAPSED_PER_DAY = 6;

/** Deterministic jitter spreads due dates without introducing randomness. */
export const JITTER_FRACTION = 0.1;

/**
 * How Final Test results feed the scheduler.
 *
 * 'demote_only' — a missed question demotes, a correct one updates statistics
 * but does NOT promote or advance the due date. Otherwise a user could empty
 * their review queue by retaking the test, which is precisely the material they
 * most need to see again.
 */
export const FINAL_TEST_FEEDBACK: 'demote_only' | 'none' | 'full' = 'demote_only';

/** Bumped when any rule above changes, triggering a projection rebuild. */
export const SCHEDULER_VERSION = 1;

/** Final Test shape, mirroring the real interview. */
export const FINAL_TEST_LENGTH = 20;
export const FINAL_TEST_PASS_MARK = 12;

/**
 * A session at 1am belongs to the previous day, which is how people actually
 * experience "today" and stops late-night study silently breaking a streak.
 */
export const DAY_START_HOUR = 4;

/** Earned at each 7-day streak milestone; never more than one held. */
export const STREAK_FREEZE_INTERVAL = 7;
export const MAX_STREAK_FREEZES = 1;
