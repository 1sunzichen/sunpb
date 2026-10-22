CREATE TABLE payment_test_orders (
  id TEXT PRIMARY KEY,
  run_hash TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'wechat' CHECK(provider='wechat'),
  amount_cents INTEGER NOT NULL DEFAULT 1 CHECK(amount_cents=1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid')),
  transaction_id TEXT UNIQUE,
  code_url TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  paid_at INTEGER,
  callback_at INTEGER,
  query_at INTEGER
);
