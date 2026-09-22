CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL CHECK(length(nickname) BETWEEN 2 AND 16),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  correct INTEGER NOT NULL DEFAULT 0 CHECK(correct IN (0, 1)),
  attempts INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, question_id)
);
CREATE INDEX IF NOT EXISTS progress_user_lesson ON progress(user_id, lesson_id, correct);
