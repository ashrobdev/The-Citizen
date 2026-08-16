import { gradeSingle, type MatchResult } from '../domain/grading/grader';
import { gradeMulti, segmentAnswers, type MultiResult } from '../domain/grading/multi';
import type { InputMode } from '../domain/grading/normalize';
import { drawFinalTest } from '../domain/finaltest/spec';
import { ALL_QUESTION_IDS, getQuestion } from '../domain/questions/bank';
import type { Question, QuestionId } from '../domain/questions/types';
import { DAILY_QUESTION_COUNT } from '../domain/scheduling/config';
import { toDayKey } from '../domain/scheduling/dayKey';
import { rebuildAllStates } from '../domain/scheduling/projection';
import { selectDailyQuestions } from '../domain/scheduling/selectDaily';
import { computeStreak, type StreakState } from '../domain/scheduling/streak';
import type { Attempt } from '../domain/scheduling/types';
import type { Repositories, SessionRecord } from '../data/repositories';

/**
 * Orchestrates a daily session: pick the questions, grade answers, append
 * attempts, complete the day.
 *
 * All scheduling decisions come from the pure domain functions; this layer only
 * moves data between them and the repositories.
 */

/**
 * Questions whose answer depends on current officeholders cannot be graded
 * until the officials dataset lands in Phase 3. Rather than mark every attempt
 * wrong — or silently drop eight questions from the syllabus — they are asked
 * and self-attested: the user is shown what the answer depends on and states
 * whether they got it right. Faking a verdict here would be worse than asking.
 */
export function isSelfAttest(question: Question): boolean {
  return question.kind !== 'static';
}

export interface GradedAnswer {
  questionId: QuestionId;
  correct: boolean;
  /** Present for machine-graded single answers. */
  match?: MatchResult;
  /** Present for machine-graded multi-answer questions. */
  multi?: MultiResult;
  selfAttested: boolean;
}

/** Grades a raw response without persisting anything. */
export function gradeResponse(
  question: Question,
  input: string,
  mode: InputMode = 'text',
): GradedAnswer {
  if (isSelfAttest(question)) {
    return { questionId: question.id, correct: false, selfAttested: true };
  }

  if (question.requiredCount > 1) {
    const multi = gradeMulti(segmentAnswers(input), question.answers, question.requiredCount, {
      mode,
    });
    return {
      questionId: question.id,
      correct: multi.verdict === 'correct',
      multi,
      selfAttested: false,
    };
  }

  const match = gradeSingle(input, question.answers, { mode });
  return {
    questionId: question.id,
    correct: match.verdict === 'correct',
    match,
    selfAttested: false,
  };
}

export interface TodayState {
  programDay: number;
  streak: StreakState;
  session: SessionRecord;
  /** Attempts already recorded in this session, so a reopened day resumes. */
  answeredQuestionIds: QuestionId[];
  isComplete: boolean;
}

function uuid(): string {
  // Good enough for a local primary key; time-prefixed so rows sort by creation
  // the way a UUIDv7 would, which matters for replaying the attempt log.
  const t = Date.now().toString(16).padStart(12, '0');
  const r = Array.from({ length: 5 }, () =>
    Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, '0'),
  ).join('');
  return `${t}-${r}`;
}

export class SessionService {
  constructor(private readonly repos: Repositories) {}

  /** Program day = completed daily sessions + 1. Never the calendar. */
  async currentProgramDay(): Promise<number> {
    return (await this.repos.sessions.countCompleted('daily')) + 1;
  }

  async streak(now: Date = new Date()): Promise<StreakState> {
    const days = await this.repos.sessions.completedDailyDayKeys();
    return computeStreak(days, toDayKey(now));
  }

  /**
   * Builds a fresh session. The question list is decided here, once, from a
   * projection of the whole attempt log.
   */
  private async createSession(
    dayKey: string,
    programDay: number,
    now: Date,
  ): Promise<SessionRecord> {
    const attempts = await this.repos.attempts.listAll();
    const states = rebuildAllStates(ALL_QUESTION_IDS, attempts);
    const questionIds = selectDailyQuestions(
      { programDay, states, pool: ALL_QUESTION_IDS },
      DAILY_QUESTION_COUNT,
    );

    const session: SessionRecord = {
      id: uuid(),
      kind: 'daily',
      dayKey,
      programDay,
      questionIds,
      startedAt: now.getTime(),
      correctCount: 0,
    };
    await this.repos.sessions.create(session);
    return session;
  }

  /**
   * Returns today's session, creating it if needed.
   *
   * The question list is computed once and stored, so reopening the app
   * mid-session shows the same twelve in the same order.
   */
  async startOrResumeToday(now: Date = new Date()): Promise<TodayState> {
    const dayKey = toDayKey(now);
    const programDay = await this.currentProgramDay();

    const latest = await this.repos.sessions.latest('daily');

    const canResume =
      latest !== undefined && latest.completedAt === undefined && latest.dayKey === dayKey;

    const session: SessionRecord = canResume
      ? latest
      : await this.createSession(dayKey, programDay, now);

    const answered = await this.repos.attempts.listBySession(session.id);
    const answeredQuestionIds = answered.map((a) => a.questionId);

    return {
      programDay,
      streak: await this.streak(now),
      session,
      answeredQuestionIds,
      isComplete: session.completedAt !== undefined,
    };
  }

  /** Records one answered question. */
  async recordAttempt(params: {
    session: SessionRecord;
    questionId: QuestionId;
    graded: GradedAnswer;
    /** True when the user overrode the engine, or self-attested a dynamic question. */
    selfGraded: boolean;
    finalCorrect: boolean;
    now?: Date;
  }): Promise<Attempt> {
    const now = params.now ?? new Date();
    const attempt: Attempt = {
      id: uuid(),
      sessionId: params.session.id,
      questionId: params.questionId,
      source: params.session.kind === 'final_test' ? 'final_test' : 'daily',
      askedAt: now.getTime(),
      dayKey: params.session.dayKey,
      programDay: params.session.programDay,
      gradedCorrect: params.graded.correct,
      finalCorrect: params.finalCorrect,
      selfGraded: params.selfGraded,
      partialRatio: params.graded.multi?.partialRatio ?? (params.finalCorrect ? 1 : 0),
    };
    await this.repos.attempts.append(attempt);
    return attempt;
  }

  /**
   * Marks the day complete. A day counts when all twelve have been ATTEMPTED —
   * correctness does not gate it, because losing a streak over wrong answers
   * would discourage attempting hard questions.
   */
  async completeSession(sessionId: string, now: Date = new Date()): Promise<boolean> {
    const session = await this.repos.sessions.get(sessionId);
    if (!session || session.completedAt !== undefined) return false;

    const attempts = await this.repos.attempts.listBySession(sessionId);
    const attemptedIds = new Set(attempts.map((a) => a.questionId));
    if (!session.questionIds.every((id) => attemptedIds.has(id))) return false;

    const correctCount = attempts.filter((a) => a.finalCorrect).length;
    await this.repos.sessions.complete(sessionId, now.getTime(), correctCount);
    return true;
  }

  /**
   * Starts a fresh Final Test.
   *
   * Always a new session — the test is meant to be retaken, and resuming a
   * half-finished one would let a user shop for a better draw.
   *
   * The session is recorded with kind 'final_test', which is what keeps it out
   * of `completedDailyDayKeys()` and therefore out of the streak. That
   * isolation is structural rather than a conditional somebody can forget.
   */
  async startFinalTest(now: Date = new Date()): Promise<SessionRecord> {
    const session: SessionRecord = {
      id: uuid(),
      kind: 'final_test',
      dayKey: toDayKey(now),
      programDay: await this.currentProgramDay(),
      questionIds: drawFinalTest(ALL_QUESTION_IDS, now.getTime()),
      startedAt: now.getTime(),
      correctCount: 0,
    };
    await this.repos.sessions.create(session);
    return session;
  }

  /** Finalises a Final Test, however it ended. */
  async finishFinalTest(sessionId: string, now: Date = new Date()): Promise<void> {
    const attempts = await this.repos.attempts.listBySession(sessionId);
    const correct = attempts.filter((a) => a.finalCorrect).length;
    await this.repos.sessions.complete(sessionId, now.getTime(), correct);
  }

  async finalTestsTaken(): Promise<number> {
    return this.repos.sessions.countCompleted('final_test');
  }

  async focusAnswersFor(questionId: QuestionId): Promise<string[]> {
    return this.repos.focusAnswers.get(questionId);
  }

  async setFocusAnswers(questionId: QuestionId, answerIds: string[]): Promise<void> {
    await this.repos.focusAnswers.set(questionId, answerIds);
  }

  /** Convenience for screens that need the question plus the user's picks. */
  async questionWithFocus(
    questionId: QuestionId,
  ): Promise<{ question: Question; focusAnswerIds: string[] }> {
    return {
      question: getQuestion(questionId),
      focusAnswerIds: await this.repos.focusAnswers.get(questionId),
    };
  }
}
