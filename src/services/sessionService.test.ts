import { createMemoryRepositories } from '../data/memory/repositories';
import { getQuestion } from '../domain/questions/bank';
import { DAILY_QUESTION_COUNT } from '../domain/scheduling/config';

import { SessionService, gradeResponse, resolveQuestion } from './sessionService';

const at = (iso: string): Date => new Date(iso);

async function playDay(
  svc: SessionService,
  now: Date,
  outcome: (index: number) => boolean = () => true,
): Promise<void> {
  const today = await svc.startOrResumeToday(now);
  let i = 0;
  for (const questionId of today.session.questionIds) {
    const correct = outcome(i++);
    await svc.recordAttempt({
      session: today.session,
      questionId,
      graded: { questionId, correct, selfAttested: false },
      selfGraded: false,
      finalCorrect: correct,
      now,
    });
  }
  await svc.completeSession(today.session.id, now);
}

const CA = { stateCode: 'CA', programStartDay: '2026-08-16', voiceEnabled: false };

const grade = (id: number, input: string, profile = CA) => {
  const q = getQuestion(id);
  return gradeResponse(q, resolveQuestion(q, profile), input);
};

describe('gradeResponse', () => {
  it('grades a single-answer question through the cascade', () => {
    const r = grade(2, 'the constitution');
    expect(r.correct).toBe(true);
    expect(r.match?.stage).toBe('token-set');
    expect(r.selfAttested).toBe(false);
  });

  it('grades a multi-answer question as all-or-nothing', () => {
    expect(grade(81, 'Virginia, New York, Georgia, Delaware, Rhode Island').correct).toBe(true);
    const partial = grade(81, 'Virginia, New York');
    expect(partial.correct).toBe(false);
    expect(partial.multi?.matchedCount).toBe(2);
  });

  it('grades dynamic questions once the officials data supplies a name', () => {
    // State capital is a stable fact, so it grades for real.
    expect(grade(62, 'Sacramento').correct).toBe(true);
    expect(grade(62, 'Los Angeles').correct).toBe(false);
  });

  it('self-attests where no officeholder is known, rather than marking wrong', () => {
    // Speaker and Chief Justice are intentionally unfilled — inventing a name
    // would mislead someone preparing for an interview.
    for (const id of [30, 57, 61]) {
      expect(grade(id, 'anything at all').selfAttested).toBe(true);
    }
  });

  it('self-attests every dynamic question when the user has no profile', () => {
    for (const id of [23, 29, 61, 62]) {
      const q = getQuestion(id);
      expect(gradeResponse(q, resolveQuestion(q, undefined), 'x').selfAttested).toBe(true);
    }
  });

  it('does not treat static questions as self-attest', () => {
    const q = getQuestion(1);
    expect(resolveQuestion(q, CA).selfAttest).toBe(false);
  });
});

describe('profile', () => {
  it('round-trips through the repository', async () => {
    const svc = new SessionService(createMemoryRepositories());
    expect(await svc.profile()).toBeUndefined();
    await svc.saveProfile({ ...CA, district: '12' });
    expect(await svc.profile()).toEqual({ ...CA, district: '12' });
  });

  it('exposes the officials data version for the disclosure line', () => {
    const svc = new SessionService(createMemoryRepositories());
    expect(svc.officialsDataVersion()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('daily session lifecycle', () => {
  it('creates a session of exactly twelve unique questions', async () => {
    const svc = new SessionService(createMemoryRepositories());
    const today = await svc.startOrResumeToday(at('2026-08-16T10:00:00'));
    expect(today.session.questionIds).toHaveLength(DAILY_QUESTION_COUNT);
    expect(new Set(today.session.questionIds).size).toBe(DAILY_QUESTION_COUNT);
    expect(today.programDay).toBe(1);
  });

  it('resumes the same session and order when reopened', async () => {
    const svc = new SessionService(createMemoryRepositories());
    const first = await svc.startOrResumeToday(at('2026-08-16T10:00:00'));
    const again = await svc.startOrResumeToday(at('2026-08-16T14:30:00'));
    expect(again.session.id).toBe(first.session.id);
    expect(again.session.questionIds).toEqual(first.session.questionIds);
  });

  it('reports which questions were already answered', async () => {
    const svc = new SessionService(createMemoryRepositories());
    const today = await svc.startOrResumeToday(at('2026-08-16T10:00:00'));
    const q = today.session.questionIds[0];
    if (q === undefined) throw new Error('no questions');

    await svc.recordAttempt({
      session: today.session,
      questionId: q,
      graded: { questionId: q, correct: true, selfAttested: false },
      selfGraded: false,
      finalCorrect: true,
      now: at('2026-08-16T10:01:00'),
    });

    const resumed = await svc.startOrResumeToday(at('2026-08-16T10:02:00'));
    expect(resumed.answeredQuestionIds).toEqual([q]);
  });

  it('refuses to complete a day with questions outstanding', async () => {
    const svc = new SessionService(createMemoryRepositories());
    const today = await svc.startOrResumeToday(at('2026-08-16T10:00:00'));
    expect(await svc.completeSession(today.session.id, at('2026-08-16T10:05:00'))).toBe(false);
  });

  it('completes when all twelve are attempted, regardless of correctness', async () => {
    const repos = createMemoryRepositories();
    const svc = new SessionService(repos);
    // Every answer wrong — the day should still count.
    await playDay(svc, at('2026-08-16T10:00:00'), () => false);

    const days = await repos.sessions.completedDailyDayKeys();
    expect(days).toEqual(['2026-08-16']);
    expect((await svc.streak(at('2026-08-16T23:00:00'))).current).toBe(1);
  });

  it('advances the program day only when a session is completed', async () => {
    const svc = new SessionService(createMemoryRepositories());
    expect(await svc.currentProgramDay()).toBe(1);

    await svc.startOrResumeToday(at('2026-08-16T10:00:00'));
    expect(await svc.currentProgramDay()).toBe(1); // started, not finished

    await playDay(svc, at('2026-08-17T10:00:00'));
    expect(await svc.currentProgramDay()).toBe(2);
  });

  it('starts a new session on a new calendar day', async () => {
    const svc = new SessionService(createMemoryRepositories());
    await playDay(svc, at('2026-08-16T10:00:00'));
    const next = await svc.startOrResumeToday(at('2026-08-17T09:00:00'));
    expect(next.session.dayKey).toBe('2026-08-17');
    expect(next.programDay).toBe(2);
  });
});

describe('program day is not the calendar day', () => {
  it('a skipped fortnight does not skip curriculum', async () => {
    const svc = new SessionService(createMemoryRepositories());
    await playDay(svc, at('2026-08-16T10:00:00'));
    await playDay(svc, at('2026-09-16T10:00:00')); // a month later

    // Two sessions completed, so day three of the programme — not day 32.
    expect(await svc.currentProgramDay()).toBe(3);
  });
});

describe('streaks through the service', () => {
  it('builds across consecutive days', async () => {
    const svc = new SessionService(createMemoryRepositories());
    for (const d of ['2026-08-10', '2026-08-11', '2026-08-12']) {
      await playDay(svc, at(`${d}T10:00:00`));
    }
    expect((await svc.streak(at('2026-08-12T20:00:00'))).current).toBe(3);
  });

  it('a late-night session still counts as the previous day', async () => {
    const svc = new SessionService(createMemoryRepositories());
    await playDay(svc, at('2026-08-10T10:00:00'));
    // 1am on the 11th is still "the 10th" under the 4am cutoff, so this is a
    // second session on the same day rather than a new one.
    await playDay(svc, at('2026-08-11T01:00:00'));
    const streak = await svc.streak(at('2026-08-11T01:30:00'));
    expect(streak.current).toBe(1);
  });
});

describe('focus answers', () => {
  it('round-trip and are keyed by stable answer id', async () => {
    const svc = new SessionService(createMemoryRepositories());
    const q = getQuestion(81);
    const picks = q.answers.slice(0, 5).map((a) => a.id);

    await svc.setFocusAnswers(81, picks);
    expect(await svc.focusAnswersFor(81)).toEqual(picks);

    const { question, focusAnswerIds } = await svc.questionWithFocus(81);
    expect(question.id).toBe(81);
    expect(focusAnswerIds).toEqual(picks);
    // Stable ids, not indexes — content edits must not repoint a user's picks.
    expect(picks.every((p) => p.startsWith('81:'))).toBe(true);
  });

  it('replaces rather than appends', async () => {
    const svc = new SessionService(createMemoryRepositories());
    await svc.setFocusAnswers(10, ['10:a']);
    await svc.setFocusAnswers(10, ['10:b', '10:c']);
    expect(await svc.focusAnswersFor(10)).toEqual(['10:b', '10:c']);
  });
});
