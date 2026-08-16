import type { QuestionId } from '../../domain/questions/types';
import type { Attempt, DayKey, SessionKind } from '../../domain/scheduling/types';
import type {
  AttemptRepository,
  KvRepository,
  FocusAnswerRepository,
  ProfileRepository,
  Repositories,
  SessionRecord,
  SessionRepository,
  UserProfile,
} from '../repositories';

/**
 * In-memory implementations.
 *
 * These are what let the service tests run with no SQLite, no Expo runtime and
 * no async storage — the whole session flow is testable on plain node.
 */

class MemoryAttempts implements AttemptRepository {
  private readonly rows: Attempt[] = [];

  async append(attempt: Attempt): Promise<void> {
    this.rows.push({ ...attempt });
  }

  async listAll(): Promise<Attempt[]> {
    return this.rows.map((r) => ({ ...r }));
  }

  async listByQuestion(questionId: QuestionId): Promise<Attempt[]> {
    return this.rows.filter((r) => r.questionId === questionId).map((r) => ({ ...r }));
  }

  async listBySession(sessionId: string): Promise<Attempt[]> {
    return this.rows.filter((r) => r.sessionId === sessionId).map((r) => ({ ...r }));
  }
}

class MemorySessions implements SessionRepository {
  private readonly rows = new Map<string, SessionRecord>();

  async create(session: SessionRecord): Promise<void> {
    this.rows.set(session.id, { ...session, questionIds: [...session.questionIds] });
  }

  async complete(id: string, completedAt: number, correctCount: number): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    this.rows.set(id, { ...row, completedAt, correctCount });
  }

  async get(id: string): Promise<SessionRecord | undefined> {
    const row = this.rows.get(id);
    return row ? { ...row, questionIds: [...row.questionIds] } : undefined;
  }

  async latest(kind: SessionKind): Promise<SessionRecord | undefined> {
    const all = [...this.rows.values()]
      .filter((r) => r.kind === kind)
      .sort((a, b) => b.startedAt - a.startedAt);
    const row = all[0];
    return row ? { ...row, questionIds: [...row.questionIds] } : undefined;
  }

  async completedDailyDayKeys(): Promise<DayKey[]> {
    return [
      ...new Set(
        [...this.rows.values()]
          .filter((r) => r.kind === 'daily' && r.completedAt !== undefined)
          .map((r) => r.dayKey),
      ),
    ].sort();
  }

  async countCompleted(kind: SessionKind): Promise<number> {
    return [...this.rows.values()].filter((r) => r.kind === kind && r.completedAt !== undefined)
      .length;
  }
}

class MemoryFocusAnswers implements FocusAnswerRepository {
  private readonly rows = new Map<QuestionId, string[]>();

  async set(questionId: QuestionId, answerIds: string[]): Promise<void> {
    this.rows.set(questionId, [...answerIds]);
  }

  async get(questionId: QuestionId): Promise<string[]> {
    return [...(this.rows.get(questionId) ?? [])];
  }

  async getAll(): Promise<Map<QuestionId, string[]>> {
    return new Map([...this.rows].map(([k, v]) => [k, [...v]]));
  }
}

class MemoryProfile implements ProfileRepository {
  private row: UserProfile | undefined;

  async get(): Promise<UserProfile | undefined> {
    return this.row ? { ...this.row } : undefined;
  }

  async save(profile: UserProfile): Promise<void> {
    this.row = { ...profile };
  }
}

class MemoryKv implements KvRepository {
  private readonly rows = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    const v = this.rows.get(key);
    return v === undefined || v.length === 0 ? undefined : v;
  }

  async set(key: string, value: string): Promise<void> {
    this.rows.set(key, value);
  }
}

export function createMemoryRepositories(): Repositories {
  return {
    attempts: new MemoryAttempts(),
    sessions: new MemorySessions(),
    focusAnswers: new MemoryFocusAnswers(),
    profile: new MemoryProfile(),
    kv: new MemoryKv(),
  };
}
