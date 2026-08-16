import { createMemoryRepositories } from '../data/memory/repositories';
import { QUESTIONS } from '../domain/questions/bank';
import type { Repositories } from '../data/repositories';

import { ProgressService } from './progressService';
import { SessionService } from './sessionService';

const at = (iso: string): Date => new Date(iso);

/** Plays whole days so the projection has realistic history. */
async function playDays(
  svc: SessionService,
  days: string[],
  correct: (questionId: number) => boolean,
): Promise<void> {
  for (const day of days) {
    const now = at(`${day}T10:00:00`);
    const today = await svc.startOrResumeToday(now);
    for (const questionId of today.session.questionIds) {
      const ok = correct(questionId);
      await svc.recordAttempt({
        session: today.session,
        questionId,
        graded: { questionId, correct: ok, selfAttested: false },
        selfGraded: false,
        finalCorrect: ok,
        now,
      });
    }
    await svc.completeSession(today.session.id, now);
  }
}

/**
 * Forty-five consecutive days.
 *
 * Mastery needs box 5, i.e. five correct answers at intervals of 1, 2, 4, 8
 * and 16 days. Introductions also run through program day 20, so early
 * sessions are mostly new material and reviews are sparse. In practice the
 * first questions master around day 43 — a shorter run masters nothing, which
 * is the algorithm being appropriately demanding rather than a bug.
 */
const DAYS = Array.from({ length: 45 }, (_, i) => {
  const d = new Date(2026, 7, 1 + i, 12);
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
});

describe('ProgressService', () => {
  let repos: Repositories;
  let sessions: SessionService;
  let progress: ProgressService;

  beforeEach(() => {
    repos = createMemoryRepositories();
    sessions = new SessionService(repos);
    progress = new ProgressService(repos);
  });

  it('reports everything unseen before any practice', async () => {
    const s = await progress.summary();
    expect(s.total).toBe(QUESTIONS.length);
    expect(s.unseen).toBe(QUESTIONS.length);
    expect(s.mastered).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.weakest).toEqual([]);
  });

  it('counts each question in exactly one strength bucket', async () => {
    await playDays(sessions, DAYS, (id) => id % 3 !== 0);
    const s = await progress.summary();
    expect(s.mastered + s.strong + s.learning + s.unseen).toBe(s.total);
  });

  it('masters questions for a learner who never misses', async () => {
    await playDays(sessions, DAYS, () => true);
    const s = await progress.summary();
    expect(s.mastered).toBeGreaterThan(0);
    expect(s.accuracy).toBe(1);
  });

  it('masters nothing for a learner who always misses', async () => {
    await playDays(sessions, DAYS, () => false);
    const s = await progress.summary();
    expect(s.mastered).toBe(0);
    expect(s.accuracy).toBe(0);
  });

  it('ranks genuinely weak questions first, and excludes unseen ones', async () => {
    await playDays(sessions, DAYS, (id) => id % 4 !== 0);
    const s = await progress.summary();

    expect(s.weakest.length).toBeGreaterThan(0);
    // Never recommend revising something the user has not met yet.
    expect(s.weakest.every((w) => w.asked > 0)).toBe(true);
    expect(s.weakest.every((w) => w.strength !== 'mastered')).toBe(true);

    // Sorted worst-accuracy first.
    const accuracies = s.weakest.map((w) => w.correct / w.asked);
    expect([...accuracies].sort((a, b) => a - b)).toEqual(accuracies);
  });

  it('splits mastery by section with correct totals', async () => {
    await playDays(sessions, DAYS, () => true);
    const s = await progress.summary();
    const totals = s.bySection.government.total + s.bySection.history.total + s.bySection.symbols.total;
    expect(totals).toBe(QUESTIONS.length);
    for (const section of ['government', 'history', 'symbols'] as const) {
      expect(s.bySection[section].mastered).toBeLessThanOrEqual(s.bySection[section].total);
    }
  });

  it('agrees with the scheduler, because both replay the same log', async () => {
    await playDays(sessions, DAYS, (id) => id % 2 === 0);
    const s = await progress.summary();
    const seen = s.perQuestion.filter((p) => p.asked > 0).length;
    expect(seen).toBeGreaterThan(0);
    expect(s.unseen).toBe(s.total - seen);
  });

  it('needs sustained correct answers before calling anything mastered', async () => {
    // Twenty days is not enough, however perfect the learner — the intervals
    // simply do not allow five exposures that quickly.
    const shortRepos = createMemoryRepositories();
    await playDays(new SessionService(shortRepos), DAYS.slice(0, 20), () => true);
    expect((await new ProgressService(shortRepos).summary()).mastered).toBe(0);
  });

  it('returns detail for a single question including focus picks', async () => {
    await playDays(sessions, ['2026-08-01'], () => false);
    await sessions.setFocusAnswers(1, ['1:republic']);

    const d = await progress.detail(1);
    expect(d.progress.questionId).toBe(1);
    expect(d.focusAnswerIds).toEqual(['1:republic']);
  });
});
