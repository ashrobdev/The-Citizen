import * as SQLite from 'expo-sqlite';

/**
 * Schema and migrations.
 *
 * `attempts` is append-only and is the source of truth; everything else is
 * either derivable from it or user configuration. There is deliberately no
 * UPDATE or DELETE path for attempts anywhere in the codebase — an appeal
 * appends a new row instead.
 *
 * Every mutable table carries `updated_at`, and ids are time-prefixed strings,
 * so a future backend can sync by replaying appended rows rather than
 * reconciling divergent state.
 */

const MIGRATIONS: ReadonlyArray<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS attempts (
        id             TEXT PRIMARY KEY NOT NULL,
        session_id     TEXT NOT NULL,
        question_id    INTEGER NOT NULL,
        source         TEXT NOT NULL,
        asked_at       INTEGER NOT NULL,
        day_key        TEXT NOT NULL,
        program_day    INTEGER NOT NULL,
        graded_correct INTEGER NOT NULL,
        final_correct  INTEGER NOT NULL,
        self_graded    INTEGER NOT NULL,
        partial_ratio  REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_attempts_question ON attempts(question_id);
      CREATE INDEX IF NOT EXISTS idx_attempts_session  ON attempts(session_id);
      CREATE INDEX IF NOT EXISTS idx_attempts_asked_at ON attempts(asked_at);

      CREATE TABLE IF NOT EXISTS sessions (
        id            TEXT PRIMARY KEY NOT NULL,
        kind          TEXT NOT NULL,
        day_key       TEXT NOT NULL,
        program_day   INTEGER NOT NULL,
        question_ids  TEXT NOT NULL,
        started_at    INTEGER NOT NULL,
        completed_at  INTEGER,
        correct_count INTEGER NOT NULL DEFAULT 0,
        updated_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_kind_started ON sessions(kind, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_completed    ON sessions(kind, completed_at);

      CREATE TABLE IF NOT EXISTS focus_answers (
        question_id INTEGER NOT NULL,
        answer_id   TEXT NOT NULL,
        rank        INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        PRIMARY KEY (question_id, answer_id)
      );

      CREATE TABLE IF NOT EXISTS profile (
        id                INTEGER PRIMARY KEY CHECK (id = 1),
        state_code        TEXT NOT NULL,
        district          TEXT,
        program_start_day TEXT NOT NULL,
        voice_enabled     INTEGER NOT NULL DEFAULT 0,
        updated_at        INTEGER NOT NULL
      );
    `,
  },
];

export const DATABASE_NAME = 'the-citizen.db';

export async function openDatabase(
  name: string = DATABASE_NAME,
): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate(db);
  return db;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
    });
    // PRAGMA cannot be parameterised; the value is a literal from our own list.
    await db.execAsync(`PRAGMA user_version = ${migration.version}`);
  }
}
