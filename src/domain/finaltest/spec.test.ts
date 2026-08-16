import { ALL_QUESTION_IDS } from '../questions/bank';
import { FINAL_TEST_LENGTH, FINAL_TEST_PASS_MARK } from '../scheduling/config';

import { FINAL_TEST_FAIL_MARK, drawFinalTest, isDecided, testOutcome } from './spec';

describe('final test outcome', () => {
  it('passes the moment the twelfth correct answer lands', () => {
    expect(testOutcome(11, 0)).toBe('in-progress');
    expect(testOutcome(12, 0)).toBe('passed');
  });

  it('fails once a pass is arithmetically impossible', () => {
    // 20 questions, 12 to pass, so the 9th wrong answer decides it: at most
    // 11 correct remain.
    expect(FINAL_TEST_FAIL_MARK).toBe(9);
    expect(testOutcome(0, 8)).toBe('in-progress');
    expect(testOutcome(0, 9)).toBe('failed');
  });

  it('never leaves a full test undecided', () => {
    // Any split of 20 answers must resolve, or the runner would hang.
    for (let correct = 0; correct <= FINAL_TEST_LENGTH; correct++) {
      const wrong = FINAL_TEST_LENGTH - correct;
      expect(testOutcome(correct, wrong)).not.toBe('in-progress');
    }
  });

  it('prefers pass when both thresholds are somehow met', () => {
    expect(testOutcome(12, 9)).toBe('passed');
  });

  it('isDecided agrees with testOutcome', () => {
    expect(isDecided(11, 8)).toBe(false);
    expect(isDecided(12, 0)).toBe(true);
    expect(isDecided(0, 9)).toBe(true);
  });

  it('a passing run can be shorter than twenty questions', () => {
    // Twelve straight correct answers ends the test at question twelve.
    let correct = 0;
    let asked = 0;
    while (!isDecided(correct, 0)) {
      correct++;
      asked++;
    }
    expect(asked).toBe(FINAL_TEST_PASS_MARK);
  });
});

describe('drawFinalTest', () => {
  it('draws twenty distinct questions', () => {
    const drawn = drawFinalTest(ALL_QUESTION_IDS, 1);
    expect(drawn).toHaveLength(FINAL_TEST_LENGTH);
    expect(new Set(drawn).size).toBe(FINAL_TEST_LENGTH);
  });

  it('only draws real question ids', () => {
    const valid = new Set(ALL_QUESTION_IDS);
    for (const id of drawFinalTest(ALL_QUESTION_IDS, 99)) {
      expect(valid.has(id)).toBe(true);
    }
  });

  it('is reproducible from its seed', () => {
    expect(drawFinalTest(ALL_QUESTION_IDS, 7)).toEqual(drawFinalTest(ALL_QUESTION_IDS, 7));
  });

  it('gives a different test for a different seed', () => {
    expect(drawFinalTest(ALL_QUESTION_IDS, 1)).not.toEqual(drawFinalTest(ALL_QUESTION_IDS, 2));
  });

  it('samples the whole bank rather than favouring low ids', () => {
    // Across many draws every question should eventually appear — a biased
    // shuffle would quietly hide part of the syllabus from the mock exam.
    const seen = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      for (const id of drawFinalTest(ALL_QUESTION_IDS, seed)) seen.add(id);
    }
    expect(seen.size).toBe(ALL_QUESTION_IDS.length);
  });

  it('copes with a pool smaller than the test length', () => {
    expect(drawFinalTest([1, 2, 3], 5)).toHaveLength(3);
  });
});
