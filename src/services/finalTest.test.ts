import { createMemoryRepositories } from '../data/memory/repositories';
import { FINAL_TEST_LENGTH } from '../domain/scheduling/config';
import { rebuildAllStates } from '../domain/scheduling/projection';
import { ALL_QUESTION_IDS } from '../domain/questions/bank';

import { SessionService } from './sessionService';

const at = (iso: string): Date => new Date(iso);

async function completeDay(svc: SessionService, now: Date): Promise<void> {
  const today = await svc.startOrResumeToday(now);
  for (const questionId of today.session.questionIds) {
    await svc.recordAttempt({
      session: today.session,
      questionId,
      graded: { questionId, correct: true, selfAttested: false },
      selfGraded: false,
      finalCorrect: true,
      now,
    });
  }
  await svc.completeSession(today.session.id, now);
}

describe('the Final Test never touches the streak', () => {
  it('taking one does not start a streak', async () => {
    const svc = new SessionService(createMemoryRepositories());
    const test = await svc.startFinalTest(at('2026-08-16T10:00:00'));

    for (const questionId of test.questionIds) {
      await svc.recordAttempt({
        session: test,
        questionId,
        graded: { questionId, correct: true, selfAttested: false },
        selfGraded: false,
        finalCorrect: true,
        now: at('2026-08-16T10:05:00'),
      });
    }
    await svc.finishFinalTest(test.id, at('2026-08-16T10:30:00'));

    expect((await svc.streak(at('2026-08-16T23:00:00'))).current).toBe(0);
  });

  it('taking one on a missed day does not preserve an existing streak', async () => {
    const svc = new SessionService(createMemoryRepositories());
    await completeDay(svc, at('2026-08-10T10:00:00'));
    await completeDay(svc, at('2026-08-11T10:00:00'));

    // Only a Final Test on the 12th — the daily was skipped.
    const test = await svc.startFinalTest(at('2026-08-12T10:00:00'));
    await svc.finishFinalTest(test.id, at('2026-08-12T10:20:00'));

    // Two days of streak, then a gap with no freeze earned yet.
    expect((await svc.streak(at('2026-08-13T10:00:00'))).current).toBe(0);
  });

  it('does not advance the program day', async () => {
    const svc = new SessionService(createMemoryRepositories());
    await completeDay(svc, at('2026-08-10T10:00:00'));
    expect(await svc.currentProgramDay()).toBe(2);

    const test = await svc.startFinalTest(at('2026-08-10T12:00:00'));
    await svc.finishFinalTest(test.id, at('2026-08-10T12:30:00'));

    expect(await svc.currentProgramDay()).toBe(2);
  });

  it('is counted separately', async () => {
    const svc = new SessionService(createMemoryRepositories());
    const test = await svc.startFinalTest(at('2026-08-16T10:00:00'));
    await svc.finishFinalTest(test.id, at('2026-08-16T10:20:00'));
    expect(await svc.finalTestsTaken()).toBe(1);
  });
});

describe('final test draws', () => {
  it('is twenty distinct questions', async () => {
    const svc = new SessionService(createMemoryRepositories());
    const test = await svc.startFinalTest(at('2026-08-16T10:00:00'));
    expect(test.questionIds).toHaveLength(FINAL_TEST_LENGTH);
    expect(new Set(test.questionIds).size).toBe(FINAL_TEST_LENGTH);
  });

  it('always starts fresh, so a draw cannot be shopped for', async () => {
    const svc = new SessionService(createMemoryRepositories());
    const a = await svc.startFinalTest(at('2026-08-16T10:00:00'));
    const b = await svc.startFinalTest(at('2026-08-16T10:00:01'));
    expect(b.id).not.toBe(a.id);
  });
});

describe('final test feedback into the scheduler is demote-only', () => {
  it('a wrong answer weakens the question, a correct one does not strengthen it', async () => {
    const repos = createMemoryRepositories();
    const svc = new SessionService(repos);

    // Build a question up through daily practice first.
    await completeDay(svc, at('2026-08-10T10:00:00'));
    const practised = (await repos.attempts.listAll())[0];
    if (!practised) throw new Error('expected a daily attempt');
    const questionId = practised.questionId;

    const before = rebuildAllStates(ALL_QUESTION_IDS, await repos.attempts.listAll()).get(
      questionId,
    );
    if (!before) throw new Error('missing state');

    // A correct Final Test answer: statistics move, scheduling does not.
    const pass = await svc.startFinalTest(at('2026-08-11T10:00:00'));
    await svc.recordAttempt({
      session: pass,
      questionId,
      graded: { questionId, correct: true, selfAttested: false },
      selfGraded: false,
      finalCorrect: true,
      now: at('2026-08-11T10:01:00'),
    });

    const afterCorrect = rebuildAllStates(ALL_QUESTION_IDS, await repos.attempts.listAll()).get(
      questionId,
    );
    expect(afterCorrect?.box).toBe(before.box);
    expect(afterCorrect?.dueOn).toBe(before.dueOn);
    expect(afterCorrect?.asked).toBe(before.asked + 1);

    // A wrong one demotes.
    const fail = await svc.startFinalTest(at('2026-08-12T10:00:00'));
    await svc.recordAttempt({
      session: fail,
      questionId,
      graded: { questionId, correct: false, selfAttested: false },
      selfGraded: false,
      finalCorrect: false,
      now: at('2026-08-12T10:01:00'),
    });

    const afterWrong = rebuildAllStates(ALL_QUESTION_IDS, await repos.attempts.listAll()).get(
      questionId,
    );
    expect(afterWrong?.box).toBeLessThan(before.box);
    expect(afterWrong?.lapses).toBe(before.lapses + 1);
  });
});
