CREATE TABLE memorials (
 id TEXT PRIMARY KEY,
 owner_hash TEXT NOT NULL,
 request_id TEXT NOT NULL,
 recovery_hash TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('person','pet','animal')),
 name TEXT NOT NULL,
 relationship TEXT NOT NULL DEFAULT '',
 birth_date TEXT NOT NULL DEFAULT '',
 death_date TEXT NOT NULL DEFAULT '',
 epitaph TEXT NOT NULL DEFAULT '',
 story TEXT NOT NULL,
 photo TEXT,
 is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 UNIQUE(owner_hash,request_id)
);
CREATE INDEX memorials_owner ON memorials(owner_hash,created_at DESC);
CREATE INDEX memorials_public ON memorials(is_public,created_at DESC,id DESC);
