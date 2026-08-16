import type { QuestionId } from '../domain/questions/types';
import type { Attempt, DayKey, SessionKind } from '../domain/scheduling/types';

/**
 * Persistence contracts.
 *
 * Services depend only on these, never on SQLite. Two implementations exist:
 * `sqlite/` for the app and `memory/` for tests, which is what lets every
 * service test run without a database. A future backend becomes a third
 * implementation rather than an edit to any caller.
 *
 * Deliberately no ORM. The queries here are inserts and indexed selects; a
 * schema-mapping layer would be weight without leverage. If the query surface
 * grows teeth later, it slots in behind these same interfaces.
 */

export interface SessionRecord {
  id: string;
  kind: SessionKind;
  dayKey: DayKey;
  programDay: number;
  /** Ordered, decided once at creation so reopening never reshuffles. */
  questionIds: QuestionId[];
  startedAt: number;
  completedAt?: number;
  correctCount: number;
}

export interface UserProfile {
  stateCode: string;
  /** Congressional district, or 'AL' for at-large. Undefined until chosen. */
  district?: string;
  programStartDay: DayKey;
  voiceEnabled: boolean;
}

/**
 * Append-only. There is intentionally no update or delete: an appeal appends a
 * new attempt referencing the original, which is what keeps `QuestionState` a
 * replayable projection.
 */
export interface AttemptRepository {
  append(attempt: Attempt): Promise<void>;
  listAll(): Promise<Attempt[]>;
  listByQuestion(questionId: QuestionId): Promise<Attempt[]>;
  listBySession(sessionId: string): Promise<Attempt[]>;
}

export interface SessionRepository {
  create(session: SessionRecord): Promise<void>;
  complete(id: string, completedAt: number, correctCount: number): Promise<void>;
  get(id: string): Promise<SessionRecord | undefined>;
  /** The most recent session of a kind, used to resume an unfinished day. */
  latest(kind: SessionKind): Promise<SessionRecord | undefined>;
  /** Local days with a COMPLETED daily session. The streak input. */
  completedDailyDayKeys(): Promise<DayKey[]>;
  countCompleted(kind: SessionKind): Promise<number>;
}

export interface FocusAnswerRepository {
  /** Replaces the user's picks for a question. */
  set(questionId: QuestionId, answerIds: string[]): Promise<void>;
  get(questionId: QuestionId): Promise<string[]>;
  getAll(): Promise<Map<QuestionId, string[]>>;
}

export interface ProfileRepository {
  get(): Promise<UserProfile | undefined>;
  save(profile: UserProfile): Promise<void>;
}

/** Small key/value store for cached remote data and check timestamps. */
export interface KvRepository {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

export interface Repositories {
  attempts: AttemptRepository;
  sessions: SessionRepository;
  focusAnswers: FocusAnswerRepository;
  profile: ProfileRepository;
  kv: KvRepository;
}
