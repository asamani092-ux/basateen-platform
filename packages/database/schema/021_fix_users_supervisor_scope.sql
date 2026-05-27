-- Fix: ensure users.supervisor_scope exists even if 011_gm_structure.sql fails early
-- due to duplicate columns on circles/tracks.
ALTER TABLE users ADD COLUMN supervisor_scope TEXT DEFAULT 'global';

