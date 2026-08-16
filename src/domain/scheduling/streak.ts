import { MAX_STREAK_FREEZES, STREAK_FREEZE_INTERVAL } from './config';
import { daysBetween } from './dayKey';
import type { DayKey } from './types';

/**
 * Streaks and freezes, derived by replaying completed daily sessions.
 *
 * Nothing is stored authoritatively. Replaying is clock-tamper resistant, makes
 * the freeze rules testable in isolation, and means a future backend syncs
 * sessions rather than a mutable counter that two devices could disagree about.
 *
 * Only daily sessions are passed in. Final Test sessions are excluded by the
 * caller's query, so "the Final Test never affects your streak" holds
 * structurally rather than through a conditional somebody can forget.
 */

export interface StreakState {
  current: number;
  longest: number;
  /** 0 or 1. Earned at each 7-day milestone, never accumulated beyond one. */
  freezesHeld: number;
  lastCompletedDay?: DayKey;
  /** Days a freeze was spent to cover. Surfaced in the UI as "streak saved". */
  frozenDays: DayKey[];
}

const EMPTY: StreakState = {
  current: 0,
  longest: 0,
  freezesHeld: 0,
  frozenDays: [],
};

/**
 * Computes the streak as of `today`.
 *
 * `completedDays` are the local calendar days on which all 12 daily questions
 * were attempted. Correctness does not gate completion: showing up is the habit
 * being built, and losing a streak over wrong answers would discourage
 * attempting hard questions.
 */
export function computeStreak(
  completedDays: readonly DayKey[],
  today: DayKey,
): StreakState {
  const days = [...new Set(completedDays)].filter((d) => d <= today).sort();
  if (days.length === 0) return { ...EMPTY, frozenDays: [] };

  let current = 0;
  let longest = 0;
  let freezesHeld = 0;
  const frozenDays: DayKey[] = [];
  let previous: DayKey | undefined;

  const award = (): void => {
    // A milestone while already holding one is a no-op, never a second freeze.
    if (current > 0 && current % STREAK_FREEZE_INTERVAL === 0) {
      freezesHeld = Math.min(MAX_STREAK_FREEZES, freezesHeld + 1);
    }
  };

  for (const day of days) {
    if (previous === undefined) {
      current = 1;
    } else {
      const gap = daysBetween(previous, day);
      if (gap === 1) {
        current += 1;
      } else {
        // Each missed day needs its own cover. One freeze covers exactly one.
        const missed = gap - 1;
        if (missed > 0 && freezesHeld >= 1 && missed <= MAX_STREAK_FREEZES) {
          freezesHeld -= 1;
          for (let i = 1; i <= missed; i++) frozenDays.push(addKey(previous, i));
          // The streak is preserved but the missed day does not increment it,
          // so a 9-day streak stays 9 through the gap and continues to 10 here.
          current += 1;
        } else {
          current = 1;
        }
      }
    }

    if (current > longest) longest = current;
    award();
    previous = day;
  }

  // A gap between the last completed day and today breaks the streak the same
  // way, and can spend the held freeze.
  if (previous !== undefined) {
    const gapToToday = daysBetween(previous, today);
    if (gapToToday > 1) {
      const missed = gapToToday - 1;
      if (freezesHeld >= 1 && missed <= MAX_STREAK_FREEZES) {
        freezesHeld -= 1;
        for (let i = 1; i <= missed; i++) frozenDays.push(addKey(previous, i));
      } else {
        current = 0;
      }
    }
  }

  const result: StreakState = { current, longest, freezesHeld, frozenDays };
  if (previous !== undefined) result.lastCompletedDay = previous;
  return result;
}

/** Local re-implementation to avoid a cycle with dayKey's Date helpers. */
function addKey(key: DayKey, days: number): DayKey {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days, 12);
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
