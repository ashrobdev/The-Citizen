import type { QuestionId } from '../questions/types';
import { FINAL_TEST_LENGTH, FINAL_TEST_PASS_MARK } from '../scheduling/config';

/**
 * The Final Test mirrors the real interview: an officer asks up to 20 of the
 * 128 civics questions and stops as soon as the outcome is decided.
 *
 * Two stopping conditions, both real:
 *   - 12 correct  -> pass, stop immediately
 *   - 9 wrong     -> fail, stop immediately, because 20 - 9 = 11 < 12 makes a
 *                    pass arithmetically impossible
 *
 * Stopping early on failure is not a kindness the app invented; it is what
 * actually happens, and pretending otherwise would misrepresent the exam.
 */

export type TestOutcome = 'in-progress' | 'passed' | 'failed';

/** Wrong answers that make the pass mark unreachable. */
export const FINAL_TEST_FAIL_MARK = FINAL_TEST_LENGTH - FINAL_TEST_PASS_MARK + 1; // 9

export function testOutcome(correct: number, wrong: number): TestOutcome {
  if (correct >= FINAL_TEST_PASS_MARK) return 'passed';
  if (wrong >= FINAL_TEST_FAIL_MARK) return 'failed';
  return 'in-progress';
}

/** True once no further questions can change the result. */
export function isDecided(correct: number, wrong: number): boolean {
  return testOutcome(correct, wrong) !== 'in-progress';
}

/** Seeded PRNG, so a drawn test can be reproduced from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draws the test.
 *
 * Uniformly random from the whole bank, deliberately NOT weighted toward the
 * user's weak questions. The daily session is where the algorithm helps; the
 * point of this screen is to find out what a real random draw would do, and a
 * flattering test would give false confidence before an interview.
 */
export function drawFinalTest(
  pool: readonly QuestionId[],
  seed: number,
  count: number = FINAL_TEST_LENGTH,
): QuestionId[] {
  const rand = mulberry32(seed);
  const shuffled = [...pool];

  // Fisher-Yates.
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = shuffled[i];
    const b = shuffled[j];
    if (a === undefined || b === undefined) continue;
    shuffled[i] = b;
    shuffled[j] = a;
  }

  return shuffled.slice(0, Math.min(count, shuffled.length));
}
