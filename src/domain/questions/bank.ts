import bankJson from '../../../assets/data/questions.json';

import type { Question, QuestionBank, QuestionId } from './types';

/**
 * The 128 questions, loaded from the generated asset.
 *
 * Typed via a cast rather than a runtime schema check: the shape is guaranteed
 * by `scripts/import-uscis.ts`, which fails loudly on malformed input, and by
 * `bank.test.ts`, which asserts the invariants on every run. Paying a zod parse
 * at app startup for a file we generate ourselves would buy nothing.
 */
export const QUESTION_BANK = bankJson as QuestionBank;

export const QUESTIONS: readonly Question[] = QUESTION_BANK.questions;

const BY_ID = new Map<QuestionId, Question>(QUESTIONS.map((q) => [q.id, q]));

export function getQuestion(id: QuestionId): Question {
  const q = BY_ID.get(id);
  if (!q) throw new Error(`Unknown question id: ${id}`);
  return q;
}

export const ALL_QUESTION_IDS: readonly QuestionId[] = QUESTIONS.map((q) => q.id);

/** The 20 questions available under the 65/20 exemption. */
export const SENIOR_QUESTION_IDS: readonly QuestionId[] = QUESTIONS.filter(
  (q) => q.seniorExempt,
).map((q) => q.id);

/** Questions whose answer depends on elections, appointments, or where you live. */
export const DYNAMIC_QUESTION_IDS: readonly QuestionId[] = QUESTIONS.filter(
  (q) => q.kind !== 'static',
).map((q) => q.id);
