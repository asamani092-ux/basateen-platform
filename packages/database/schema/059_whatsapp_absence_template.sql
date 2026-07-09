-- 059: Default WhatsApp absence message template (complex_settings).
-- Applied via apps/api/scripts/migrate-059-remote.mjs

ALTER TABLE complex_settings ADD COLUMN whatsapp_absence_template_ar TEXT;
