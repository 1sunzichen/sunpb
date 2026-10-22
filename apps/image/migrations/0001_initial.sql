PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 0 CHECK(credits >= 0),
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('wechat','alipay')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  credits INTEGER NOT NULL CHECK(credits > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','closed')),
  transaction_id TEXT,
  code_url TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  paid_at INTEGER,
  UNIQUE(user_id, request_id),
  UNIQUE(provider, transaction_id)
);
CREATE INDEX orders_owner ON orders(user_id, created_at DESC);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  request_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  size TEXT NOT NULL,
  input_keys TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed')),
  cost INTEGER NOT NULL DEFAULT 1 CHECK(cost = 1),
  result_key TEXT,
  error TEXT,
  provider_request_id TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  UNIQUE(user_id, request_id)
);
CREATE INDEX jobs_owner ON jobs(user_id, created_at DESC);
CREATE INDEX jobs_status ON jobs(status, created_at);
CREATE TABLE credit_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('purchase','generation','return')),
  reference_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(reason, reference_id)
);
CREATE INDEX ledger_owner ON credit_ledger(user_id, id DESC);
CREATE TRIGGER ledger_applies_balance AFTER INSERT ON credit_ledger BEGIN
  UPDATE users SET credits = credits + NEW.delta WHERE id = NEW.user_id;
END;
CREATE TRIGGER paid_order_credits AFTER UPDATE OF status ON orders
WHEN NEW.status = 'paid' AND OLD.status <> 'paid' BEGIN
  INSERT INTO credit_ledger(user_id,delta,reason,reference_id,created_at)
  VALUES(NEW.user_id,NEW.credits,'purchase',NEW.id,NEW.paid_at);
END;
CREATE TRIGGER reserve_job_credit AFTER INSERT ON jobs BEGIN
  INSERT INTO credit_ledger(user_id,delta,reason,reference_id,created_at)
  VALUES(NEW.user_id,-NEW.cost,'generation',NEW.id,NEW.created_at);
END;
CREATE TRIGGER failed_job_returns_credit AFTER UPDATE OF status ON jobs
WHEN NEW.status = 'failed' AND OLD.status IN ('queued','running') BEGIN
  INSERT INTO credit_ledger(user_id,delta,reason,reference_id,created_at)
  VALUES(NEW.user_id,NEW.cost,'return',NEW.id,NEW.finished_at);
END;
