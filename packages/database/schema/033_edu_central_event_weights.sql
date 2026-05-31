-- Central event scoring defaults (yom himma + competitions) in edu_settings

ALTER TABLE edu_settings ADD COLUMN himma_defaults_json TEXT;
ALTER TABLE edu_settings ADD COLUMN competition_defaults_json TEXT;
