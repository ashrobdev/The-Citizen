import type { QuestionId } from '../questions/types';

import { DAILY_QUESTION_COUNT } from './config';
import { applyGrade, initialState } from './leitner';
import { selectDailyQuestions } from './selectDaily';
import type { QuestionState } from './types';

/**
 * Deterministic simulation of a learner working through the programme.
 *
 * Test-only, but it lives in src/ rather than __tests__ because it exercises
 * the same reducer production uses — that shared path is the point.
 */

export type LearnerModel =
  | 'perfect'
  | 'p80'
  | 'struggling'
  /** Studies weekdays only; still completes a session each time. */
  | 'weekday-only';

export interface SimulationDay {
  programDay: number;
  questionIds: QuestionId[];
  correctIds: QuestionId[];
}

export interface SimulationResult {
  days: SimulationDay[];
  finalStates: Map<QuestionId, QuestionState>;
  /** Program day each question was first asked, or undefined if never. */
  introducedOn: Map<QuestionId, number>;
  timesAsked: Map<QuestionId, number>;
}

/** Seeded PRNG so a failing simulation is reproducible. */
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
 * Probability the learner answers a given question correctly.
 *
 * Modelled as improving with exposure, which is what makes the simulation a
 * meaningful test: a scheduler that never re-shows weak questions would leave
 * the struggling learner's accuracy flat.
 */
function successChance(model: LearnerModel, state: QuestionState, rand: () => number): boolean {
  const exposures = state.asked;
  let base: number;
  switch (model) {
    case 'perfect':
      return true;
    case 'p80':
      base = 0.8 + Math.min(0.18, exposures * 0.03);
      break;
    case 'struggling':
      base = 0.35 + Math.min(0.4, exposures * 0.05);
      break;
    case 'weekday-only':
      base = 0.75 + Math.min(0.2, exposures * 0.03);
      break;
  }
  return rand() < base;
}

export function simulate(options: {
  pool: readonly QuestionId[];
  days: number;
  learner: LearnerModel;
  seed?: number;
}): SimulationResult {
  const { pool, days, learner } = options;
  const rand = mulberry32(options.seed ?? 42);

  const states = new Map<QuestionId, QuestionState>();
  for (const id of pool) states.set(id, initialState(id));

  const introducedOn = new Map<QuestionId, number>();
  const timesAsked = new Map<QuestionId, number>();
  const log: SimulationDay[] = [];

  for (let programDay = 1; programDay <= days; programDay++) {
    const questionIds = selectDailyQuestions({ programDay, states, pool });
    const correctIds: QuestionId[] = [];

    for (const id of questionIds) {
      const state = states.get(id) ?? initialState(id);
      if (!introducedOn.has(id)) introducedOn.set(id, programDay);
      timesAsked.set(id, (timesAsked.get(id) ?? 0) + 1);

      const correct = successChance(learner, state, rand);
      if (correct) correctIds.push(id);

      states.set(
        id,
        applyGrade(state, { correct, selfGraded: false, partialRatio: correct ? 1 : 0, programDay }),
      );
    }

    log.push({ programDay, questionIds, correctIds });
  }

  return { days: log, finalStates: states, introducedOn, timesAsked };
}

export const FULL_DAY = DAILY_QUESTION_COUNT;
