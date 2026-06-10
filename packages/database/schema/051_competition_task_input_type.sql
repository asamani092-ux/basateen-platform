-- 051: Dynamic task input types for competition_tasks
-- boolean | numeric | counter — backfilled from legacy type column

ALTER TABLE competition_tasks ADD COLUMN input_type TEXT NOT NULL DEFAULT 'boolean'
  CHECK (input_type IN ('boolean', 'numeric', 'counter'));

UPDATE competition_tasks SET input_type = 'boolean' WHERE type = 'addition';
UPDATE competition_tasks SET input_type = 'counter' WHERE type = 'deduction';

-- Normalize legacy category values to the three core types
UPDATE competitions SET category = 'recitation' WHERE category = 'other';
