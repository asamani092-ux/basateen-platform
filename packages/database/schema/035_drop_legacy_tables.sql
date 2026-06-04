-- Drop backup tables after 035 RENAME swap.
-- MUST run as ONE batch (wrangler --file), NOT statement-by-statement in D1 console.
-- PRAGMA only applies within the same connection/transaction.

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS circles_legacy_035;
DROP TABLE IF EXISTS tracks_legacy_035;
DROP TABLE IF EXISTS circles_m035;
DROP TABLE IF EXISTS tracks_m035;

PRAGMA foreign_keys = ON;
