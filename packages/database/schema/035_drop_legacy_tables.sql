-- Deprecated: DROP alone fails when FKs still reference circles_legacy_035.
-- Use 036_circles_consolidate_single_table.sql instead (rebuild + drop in one batch).

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS circles_legacy_035;
DROP TABLE IF EXISTS tracks_legacy_035;
DROP TABLE IF EXISTS circles_m035;
DROP TABLE IF EXISTS tracks_m035;

PRAGMA foreign_keys = ON;
