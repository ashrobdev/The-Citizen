import { ALL_QUESTION_IDS } from '../questions/bank';

import {
  BOX_INTERVALS,
  DAILY_QUESTION_COUNT,
  EASE_MAX,
  JITTER_FRACTION,
  MAX_BOX,
} from './config';
import { applyFinalTestGrade, applyGrade, initialState, isMastered } from './leitner';
import { rebuildAllStates, reduceQuestionState } from './projection';
import { simulate, type LearnerModel } from './simulate';
import type { Attempt } from './types';

const POOL = ALL_QUESTION_IDS;
const LEARNERS: LearnerModel[] = ['perfect', 'p80', 'struggling', 'weekday-only'];

const grade = (correct: boolean, programDay: number, partialRatio = correct ? 1 : 0) => ({
  correct,
  selfGraded: false,
  partialRatio,
  programDay,
});

describe('leitner box mechanics', () => {
  it('promotes one box on a correct answer', () => {
    const s = applyGrade(initialState(1), grade(true, 1));
    expect(s.box).toBe(1);
    expect(s.correct).toBe(1);
    expect(s.consecCorrectStrict).toBe(1);
    expect(s.dueOn).toBeGreaterThan(1);
  });

  it('resets a low box to zero on a wrong answer', () => {
    let s = initialState(1);
    s = applyGrade(s, grade(true, 1)); // box 1
    s = applyGrade(s, grade(true, 2)); // box 2
    s = applyGrade(s, grade(false, 3));
    expect(s.box).toBe(0);
    expect(s.lapses).toBe(1);
    expect(s.consecCorrectStrict).toBe(0);
  });

  it('drops a well-known question two boxes rather than to zero', () => {
    let s = initialState(1);
    for (let d = 1; d <= 5; d++) s = applyGrade(s, grade(true, d)); // box 5
    expect(s.box).toBe(5);
    s = applyGrade(s, grade(false, 6));
    expect(s.box).toBe(3);
  });

  it('demotes only one box when a multi-answer question was half right', () => {
    let s = initialState(81);
    for (let d = 1; d <= 5; d++) s = applyGrade(s, grade(true, d));
    s = applyGrade(s, grade(false, 6, 0.6));
    expect(s.box).toBe(4);
  });

  it('never exceeds the maximum box', () => {
    let s = initialState(1);
    for (let d = 1; d <= 20; d++) s = applyGrade(s, grade(true, d));
    expect(s.box).toBe(MAX_BOX);
  });

  it('requeues a wrong answer the same day', () => {
    const s = applyGrade(initialState(1), grade(false, 7));
    expect(s.dueOn).toBe(7);
  });
});

describe('mastery', () => {
  it('needs repeated unassisted success', () => {
    // Box 5 is the bar, so five promotions — four correct answers is not enough.
    let s = initialState(1);
    for (let d = 1; d <= 4; d++) s = applyGrade(s, grade(true, d));
    expect(isMastered(s)).toBe(false);

    s = applyGrade(s, grade(true, 5));
    expect(isMastered(s)).toBe(true);
    expect(s.masteredOnDay).toBe(5);
  });

  it('cannot be reached by appealing', () => {
    // Self-graded corrects promote the box but never the strict counter.
    let s = initialState(1);
    for (let d = 1; d <= 8; d++) {
      s = applyGrade(s, { correct: true, selfGraded: true, partialRatio: 1, programDay: d });
    }
    expect(s.box).toBe(MAX_BOX);
    expect(s.consecCorrectStrict).toBe(0);
    expect(isMastered(s)).toBe(false);
  });
});

describe('final test feedback is demote-only', () => {
  it('demotes on a wrong answer', () => {
    let s = initialState(1);
    for (let d = 1; d <= 5; d++) s = applyGrade(s, grade(true, d));
    const after = applyFinalTestGrade(s, grade(false, 6));
    expect(after.box).toBeLessThan(s.box);
  });

  it('does not promote or advance the due date on a correct answer', () => {
    let s = initialState(1);
    s = applyGrade(s, grade(true, 1));
    const before = { box: s.box, dueOn: s.dueOn };
    const after = applyFinalTestGrade(s, grade(true, 2));
    expect(after.box).toBe(before.box);
    expect(after.dueOn).toBe(before.dueOn);
    expect(after.asked).toBe(s.asked + 1); // statistics still update
  });

  it('so retaking the test cannot empty the review queue', () => {
    let s = initialState(1);
    s = applyGrade(s, grade(true, 1));
    const due = s.dueOn;
    for (let i = 0; i < 20; i++) s = applyFinalTestGrade(s, grade(true, 2));
    expect(s.dueOn).toBe(due);
    expect(isMastered(s)).toBe(false);
  });
});

describe('projection from the append-only log', () => {
  const attempt = (over: Partial<Attempt>): Attempt => ({
    id: 'a',
    sessionId: 's',
    questionId: 1,
    source: 'daily',
    askedAt: 0,
    dayKey: '2026-08-16',
    programDay: 1,
    gradedCorrect: true,
    finalCorrect: true,
    selfGraded: false,
    partialRatio: 1,
    ...over,
  });

  it('replays attempts in time order regardless of input order', () => {
    const attempts = [
      attempt({ id: '3', askedAt: 300, programDay: 3, finalCorrect: false, partialRatio: 0 }),
      attempt({ id: '1', askedAt: 100, programDay: 1 }),
      attempt({ id: '2', askedAt: 200, programDay: 2 }),
    ];
    const s = reduceQuestionState(1, attempts);
    expect(s.asked).toBe(3);
    expect(s.correct).toBe(2);
    expect(s.box).toBe(0); // last attempt was wrong
  });

  it('ignores attempts for other questions', () => {
    const s = reduceQuestionState(1, [attempt({ questionId: 2, askedAt: 1 })]);
    expect(s.asked).toBe(0);
  });

  it('consumes finalCorrect, not gradedCorrect, so appeals count', () => {
    const s = reduceQuestionState(
      1,
      [attempt({ askedAt: 1, gradedCorrect: false, finalCorrect: true, selfGraded: true })],
    );
    expect(s.correct).toBe(1);
    expect(s.consecCorrectStrict).toBe(0); // but not toward mastery
  });

  it('is deterministic — replaying gives identical state', () => {
    const attempts = [1, 2, 3, 4].map((i) =>
      attempt({ id: String(i), askedAt: i * 100, programDay: i }),
    );
    expect(reduceQuestionState(1, attempts)).toEqual(reduceQuestionState(1, attempts));
  });

  it('rebuilds every question in the pool', () => {
    const states = rebuildAllStates(POOL, []);
    expect(states.size).toBe(128);
    expect(states.get(1)?.asked).toBe(0);
  });
});

describe('daily selection over a simulated 120 days', () => {
  it.each(LEARNERS)('delivers exactly 12 unique questions a day (%s)', (learner) => {
    const { days } = simulate({ pool: POOL, days: 120, learner });
    for (const day of days) {
      expect(day.questionIds).toHaveLength(DAILY_QUESTION_COUNT);
      expect(new Set(day.questionIds).size).toBe(DAILY_QUESTION_COUNT);
    }
  });

  it.each(LEARNERS)('introduces all 128 questions by program day 26 (%s)', (learner) => {
    const { introducedOn } = simulate({ pool: POOL, days: 120, learner });
    expect(introducedOn.size).toBe(128);
    const last = Math.max(...introducedOn.values());
    expect(last).toBeLessThanOrEqual(26);
  });

  /**
   * The longest a question can legitimately go unseen is one full top-box
   * interval: 32 days at maximum ease (1.3) and maximum jitter (+10%) is ~46.
   * Derived rather than hardcoded so the bound tracks config changes.
   */
  const TOP_BOX_INTERVAL = BOX_INTERVALS[MAX_BOX] ?? 32;
  const MAX_LEGITIMATE_GAP =
    Math.ceil(TOP_BOX_INTERVAL * EASE_MAX * (1 + JITTER_FRACTION)) + 2;

  it.each(LEARNERS)('never starves a question beyond one top-box interval (%s)', (learner) => {
    const { days } = simulate({ pool: POOL, days: 120, learner });
    const lastSeen = new Map<number, number>();
    for (const day of days) {
      for (const id of day.questionIds) lastSeen.set(id, day.programDay);
    }
    for (const id of POOL) {
      // Every question was seen, and seen recently enough to still be revising.
      expect(lastSeen.get(id) ?? 0).toBeGreaterThan(120 - MAX_LEGITIMATE_GAP);
    }
  });

  it('shows a struggling learner their weak questions far more often', () => {
    const { timesAsked } = simulate({ pool: POOL, days: 120, learner: 'struggling' });
    const perfect = simulate({ pool: POOL, days: 120, learner: 'perfect' });

    const totalStruggling = [...timesAsked.values()].reduce((a, b) => a + b, 0);
    const totalPerfect = [...perfect.timesAsked.values()].reduce((a, b) => a + b, 0);
    // Same number of slots, but concentrated differently.
    expect(totalStruggling).toBe(totalPerfect);

    const spread = (m: Map<number, number>): number => {
      const v = [...m.values()];
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
    };
    // A struggling learner's exposures concentrate on their weak material.
    expect(spread(timesAsked)).toBeGreaterThan(spread(perfect.timesAsked));
  });

  it('still fills the day once a perfect learner has mastered everything', () => {
    const { days, finalStates } = simulate({ pool: POOL, days: 120, learner: 'perfect' });
    const mastered = [...finalStates.values()].filter(isMastered).length;
    expect(mastered).toBe(128);
    expect(days[119]?.questionIds).toHaveLength(DAILY_QUESTION_COUNT);
  });

  it('is reproducible for a given seed', () => {
    const a = simulate({ pool: POOL, days: 40, learner: 'p80', seed: 7 });
    const b = simulate({ pool: POOL, days: 40, learner: 'p80', seed: 7 });
    expect(a.days).toEqual(b.days);
  });
});
