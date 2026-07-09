-- تتبع الترحيلات المطبّقة على D1
CREATE TABLE IF NOT EXISTS _migrations_applied (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
