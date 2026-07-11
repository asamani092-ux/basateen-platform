-- 072: أنواع شرائح العرض (media/kpi/competition) + مدة لكل شريحة + تمكين المؤشرات
-- يُطبَّق عبر migrate-072-remote.mjs مع فحص وجود كل عمود/فهرس (idempotent)
-- display_media: slide_type, competition_id, duration_seconds
-- complex_settings: display_indicators_enabled
-- فهرس: idx_display_media_slide_type

SELECT 1 WHERE 0;
