import { ALL_QUESTION_IDS, QUESTIONS, getQuestion } from '../domain/questions/bank';
import type { QuestionId, Section } from '../domain/questions/types';
import { isMastered } from '../domain/scheduling/leitner';
import { rebuildAllStates } from '../domain/scheduling/projection';
import type { QuestionState } from '../domain/scheduling/types';
import type { Repositories } from '../data/repositories';

/**
 * Read-only views over the attempt log, for the progress screen.
 *
 * Everything here is derived by replaying attempts through the same reducer
 * the scheduler uses, so what the user is shown can never disagree with what
 * the algorithm believes.
 */

export type Strength = 'unseen' | 'learning' | 'strong' | 'mastered';

export interface QuestionProgress {
  questionId: QuestionId;
  section: Section;
  strength: Strength;
  asked: number;
  correct: number;
  box: number;
}

export interface ProgressSummary {
  mastered: number;
  strong: number;
  learning: number;
  unseen: number;
  total: number;
  /** Lifetime accuracy across every attempt, 0..1. */
  accuracy: number;
  /** Weakest questions the user has actually seen, worst first. */
  weakest: QuestionProgress[];
  bySection: Record<Section, { mastered: number; total: number }>;
  perQuestion: QuestionProgress[];
}

export function strengthOf(state: QuestionState): Strength {
  if (state.asked === 0) return 'unseen';
  if (isMastered(state)) return 'mastered';
  if (state.box >= 3) return 'strong';
  return 'learning';
}

export class ProgressService {
  constructor(private readonly repos: Repositories) {}

  async summary(): Promise<ProgressSummary> {
    const attempts = await this.repos.attempts.listAll();
    const states = rebuildAllStates(ALL_QUESTION_IDS, attempts);

    const perQuestion: QuestionProgress[] = QUESTIONS.map((q) => {
      const state = states.get(q.id);
      const strength = state ? strengthOf(state) : 'unseen';
      return {
        questionId: q.id,
        section: q.section,
        strength,
        asked: state?.asked ?? 0,
        correct: state?.correct ?? 0,
        box: state?.box ?? 0,
      };
    });

    const count = (s: Strength): number => perQuestion.filter((p) => p.strength === s).length;

    const totalAttempts = attempts.length;
    const totalCorrect = attempts.filter((a) => a.finalCorrect).length;

    const bySection = { government: 0, history: 0, symbols: 0 } as Record<Section, number>;
    const sectionTotals = { government: 0, history: 0, symbols: 0 } as Record<Section, number>;
    for (const p of perQuestion) {
      sectionTotals[p.section] += 1;
      if (p.strength === 'mastered') bySection[p.section] += 1;
    }

    // Weakest first: lowest accuracy, then most lapses via the lowest box.
    // Only questions actually seen — an unseen question is not a weakness.
    const weakest = perQuestion
      .filter((p) => p.asked > 0 && p.strength !== 'mastered')
      .sort((a, b) => {
        const accA = a.correct / a.asked;
        const accB = b.correct / b.asked;
        return accA - accB || a.box - b.box || a.questionId - b.questionId;
      })
      .slice(0, 8);

    return {
      mastered: count('mastered'),
      strong: count('strong'),
      learning: count('learning'),
      unseen: count('unseen'),
      total: perQuestion.length,
      accuracy: totalAttempts === 0 ? 0 : totalCorrect / totalAttempts,
      weakest,
      bySection: {
        government: { mastered: bySection.government, total: sectionTotals.government },
        history: { mastered: bySection.history, total: sectionTotals.history },
        symbols: { mastered: bySection.symbols, total: sectionTotals.symbols },
      },
      perQuestion,
    };
  }

  /** Everything known about one question, for the detail screen. */
  async detail(questionId: QuestionId): Promise<{
    progress: QuestionProgress;
    focusAnswerIds: string[];
  }> {
    const attempts = await this.repos.attempts.listByQuestion(questionId);
    const states = rebuildAllStates([questionId], attempts);
    const state = states.get(questionId);
    const question = getQuestion(questionId);

    return {
      progress: {
        questionId,
        section: question.section,
        strength: state ? strengthOf(state) : 'unseen',
        asked: state?.asked ?? 0,
        correct: state?.correct ?? 0,
        box: state?.box ?? 0,
      },
      focusAnswerIds: await this.repos.focusAnswers.get(questionId),
    };
  }
}
