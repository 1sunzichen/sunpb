CREATE TABLE IF NOT EXISTS payment_certificates (
  merchant_id TEXT NOT NULL,
  serial TEXT NOT NULL,
  pem TEXT NOT NULL,
  not_before INTEGER NOT NULL,
  not_after INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (merchant_id, serial)
);
