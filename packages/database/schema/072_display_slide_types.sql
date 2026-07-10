-- 072: أنواع شرائح العرض (media/kpi/competition) + مدة لكل شريحة + تمكين المؤشرات
-- الصفوف الحالية تبقى slide_type = 'media'

ALTER TABLE display_media ADD COLUMN slide_type TEXT NOT NULL DEFAULT 'media';
ALTER TABLE display_media ADD COLUMN competition_id INTEGER;
ALTER TABLE display_media ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 12;

ALTER TABLE complex_settings ADD COLUMN display_indicators_enabled INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_display_media_slide_type
  ON display_media(complex_id, slide_type, is_active, display_order);
