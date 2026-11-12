CREATE TABLE IF NOT EXISTS prayer_messages (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES prayer_orders(id),
 owner_hash TEXT NOT NULL, category TEXT NOT NULL, message TEXT NOT NULL CHECK(length(message)<=120),
 created_at INTEGER NOT NULL, hidden_at INTEGER
);
CREATE INDEX IF NOT EXISTS prayer_messages_public ON prayer_messages(hidden_at,created_at DESC,id DESC);
