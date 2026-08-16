import type * as SQLite from 'expo-sqlite';

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

/** SQLite stores booleans as 0/1. */
const bool = (n: number): boolean => n === 1;
const int = (b: boolean): number => (b ? 1 : 0);

interface AttemptRow {
  id: string;
  session_id: string;
  question_id: number;
  source: string;
  asked_at: number;
  day_key: string;
  program_day: number;
  graded_correct: number;
  final_correct: number;
  self_graded: number;
  partial_ratio: number;
}

function toAttempt(r: AttemptRow): Attempt {
  return {
    id: r.id,
    sessionId: r.session_id,
    questionId: r.question_id,
    source: r.source as Attempt['source'],
    askedAt: r.asked_at,
    dayKey: r.day_key,
    programDay: r.program_day,
    gradedCorrect: bool(r.graded_correct),
    finalCorrect: bool(r.final_correct),
    selfGraded: bool(r.self_graded),
    partialRatio: r.partial_ratio,
  };
}

class SqliteAttempts implements AttemptRepository {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  /** Append-only by design: this class exposes no update or delete. */
  async append(a: Attempt): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO attempts
        (id, session_id, question_id, source, asked_at, day_key, program_day,
         graded_correct, final_correct, self_graded, partial_ratio)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a.id,
      a.sessionId,
      a.questionId,
      a.source,
      a.askedAt,
      a.dayKey,
      a.programDay,
      int(a.gradedCorrect),
      int(a.finalCorrect),
      int(a.selfGraded),
      a.partialRatio,
    );
  }

  async listAll(): Promise<Attempt[]> {
    const rows = await this.db.getAllAsync<AttemptRow>(
      'SELECT * FROM attempts ORDER BY asked_at ASC',
    );
    return rows.map(toAttempt);
  }

  async listByQuestion(questionId: QuestionId): Promise<Attempt[]> {
    const rows = await this.db.getAllAsync<AttemptRow>(
      'SELECT * FROM attempts WHERE question_id = ? ORDER BY asked_at ASC',
      questionId,
    );
    return rows.map(toAttempt);
  }

  async listBySession(sessionId: string): Promise<Attempt[]> {
    const rows = await this.db.getAllAsync<AttemptRow>(
      'SELECT * FROM attempts WHERE session_id = ? ORDER BY asked_at ASC',
      sessionId,
    );
    return rows.map(toAttempt);
  }
}

interface SessionRow {
  id: string;
  kind: string;
  day_key: string;
  program_day: number;
  question_ids: string;
  started_at: number;
  completed_at: number | null;
  correct_count: number;
}

function toSession(r: SessionRow): SessionRecord {
  const record: SessionRecord = {
    id: r.id,
    kind: r.kind as SessionKind,
    dayKey: r.day_key,
    programDay: r.program_day,
    questionIds: JSON.parse(r.question_ids) as QuestionId[],
    startedAt: r.started_at,
    correctCount: r.correct_count,
  };
  if (r.completed_at !== null) record.completedAt = r.completed_at;
  return record;
}

class SqliteSessions implements SessionRepository {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  async create(s: SessionRecord): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO sessions
        (id, kind, day_key, program_day, question_ids, started_at, completed_at, correct_count, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      s.id,
      s.kind,
      s.dayKey,
      s.programDay,
      JSON.stringify(s.questionIds),
      s.startedAt,
      s.completedAt ?? null,
      s.correctCount,
      Date.now(),
    );
  }

  async complete(id: string, completedAt: number, correctCount: number): Promise<void> {
    await this.db.runAsync(
      'UPDATE sessions SET completed_at = ?, correct_count = ?, updated_at = ? WHERE id = ?',
      completedAt,
      correctCount,
      Date.now(),
      id,
    );
  }

  async get(id: string): Promise<SessionRecord | undefined> {
    const row = await this.db.getFirstAsync<SessionRow>('SELECT * FROM sessions WHERE id = ?', id);
    return row ? toSession(row) : undefined;
  }

  async latest(kind: SessionKind): Promise<SessionRecord | undefined> {
    const row = await this.db.getFirstAsync<SessionRow>(
      'SELECT * FROM sessions WHERE kind = ? ORDER BY started_at DESC LIMIT 1',
      kind,
    );
    return row ? toSession(row) : undefined;
  }

  /**
   * Only COMPLETED daily sessions. Final Test sessions have kind='final_test'
   * and are excluded here, which is what makes "the Final Test never affects
   * your streak" structural rather than a conditional somebody can forget.
   */
  async completedDailyDayKeys(): Promise<DayKey[]> {
    const rows = await this.db.getAllAsync<{ day_key: string }>(
      `SELECT DISTINCT day_key FROM sessions
       WHERE kind = 'daily' AND completed_at IS NOT NULL
       ORDER BY day_key ASC`,
    );
    return rows.map((r) => r.day_key);
  }

  async countCompleted(kind: SessionKind): Promise<number> {
    const row = await this.db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM sessions WHERE kind = ? AND completed_at IS NOT NULL',
      kind,
    );
    return row?.n ?? 0;
  }
}

class SqliteFocusAnswers implements FocusAnswerRepository {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  async set(questionId: QuestionId, answerIds: string[]): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('DELETE FROM focus_answers WHERE question_id = ?', questionId);
      const now = Date.now();
      for (let i = 0; i < answerIds.length; i++) {
        const answerId = answerIds[i];
        if (answerId === undefined) continue;
        await this.db.runAsync(
          'INSERT INTO focus_answers (question_id, answer_id, rank, updated_at) VALUES (?, ?, ?, ?)',
          questionId,
          answerId,
          i,
          now,
        );
      }
    });
  }

  async get(questionId: QuestionId): Promise<string[]> {
    const rows = await this.db.getAllAsync<{ answer_id: string }>(
      'SELECT answer_id FROM focus_answers WHERE question_id = ? ORDER BY rank ASC',
      questionId,
    );
    return rows.map((r) => r.answer_id);
  }

  async getAll(): Promise<Map<QuestionId, string[]>> {
    const rows = await this.db.getAllAsync<{ question_id: number; answer_id: string }>(
      'SELECT question_id, answer_id FROM focus_answers ORDER BY question_id ASC, rank ASC',
    );
    const out = new Map<QuestionId, string[]>();
    for (const r of rows) {
      const list = out.get(r.question_id);
      if (list) list.push(r.answer_id);
      else out.set(r.question_id, [r.answer_id]);
    }
    return out;
  }
}

class SqliteProfile implements ProfileRepository {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  async get(): Promise<UserProfile | undefined> {
    const row = await this.db.getFirstAsync<{
      state_code: string;
      district: string | null;
      program_start_day: string;
      voice_enabled: number;
    }>('SELECT * FROM profile WHERE id = 1');
    if (!row) return undefined;

    const profile: UserProfile = {
      stateCode: row.state_code,
      programStartDay: row.program_start_day,
      voiceEnabled: bool(row.voice_enabled),
    };
    if (row.district !== null) profile.district = row.district;
    return profile;
  }

  async save(p: UserProfile): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO profile (id, state_code, district, program_start_day, voice_enabled, updated_at)
       VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         state_code = excluded.state_code,
         district = excluded.district,
         program_start_day = excluded.program_start_day,
         voice_enabled = excluded.voice_enabled,
         updated_at = excluded.updated_at`,
      p.stateCode,
      p.district ?? null,
      p.programStartDay,
      int(p.voiceEnabled),
      Date.now(),
    );
  }
}

class SqliteKv implements KvRepository {
  constructor(private readonly db: SQLite.SQLiteDatabase) {}

  async get(key: string): Promise<string | undefined> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      'SELECT value FROM kv WHERE key = ?',
      key,
    );
    return row === null || row === undefined || row.value.length === 0 ? undefined : row.value;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key,
      value,
      Date.now(),
    );
  }
}

export function createSqliteRepositories(db: SQLite.SQLiteDatabase): Repositories {
  return {
    attempts: new SqliteAttempts(db),
    sessions: new SqliteSessions(db),
    focusAnswers: new SqliteFocusAnswers(db),
    profile: new SqliteProfile(db),
    kv: new SqliteKv(db),
  };
}
