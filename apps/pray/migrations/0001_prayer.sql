CREATE TABLE IF NOT EXISTS prayer_orders (
 id TEXT PRIMARY KEY, owner_hash TEXT NOT NULL, request_id TEXT NOT NULL,
 category TEXT NOT NULL, wish_hash TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents=100),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','closed')),
 code_url TEXT, transaction_id TEXT UNIQUE, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 paid_at INTEGER, callback_at INTEGER, query_at INTEGER,
 UNIQUE(owner_hash,request_id)
);
CREATE INDEX IF NOT EXISTS prayer_orders_owner ON prayer_orders(owner_hash,created_at);
CREATE TABLE IF NOT EXISTS prayer_rituals (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES prayer_orders(id), owner_hash TEXT NOT NULL,
 wish_hash TEXT NOT NULL, category TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_certificates (
 merchant_id TEXT NOT NULL, serial TEXT NOT NULL, pem TEXT NOT NULL, not_before INTEGER NOT NULL,
 not_after INTEGER NOT NULL, fetched_at INTEGER NOT NULL, PRIMARY KEY(merchant_id,serial)
);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
