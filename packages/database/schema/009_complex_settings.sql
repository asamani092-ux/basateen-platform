-- إعدادات المجمع: خريجون، حفاظ، شرائح العرض

CREATE TABLE IF NOT EXISTS complex_settings (
  complex_id INTEGER PRIMARY KEY,
  graduates_count INTEGER NOT NULL DEFAULT 0,
  huffadh_count INTEGER NOT NULL DEFAULT 0,
  display_slides_json TEXT,
  display_mode TEXT NOT NULL DEFAULT 'carousel'
    CHECK (display_mode IN ('static', 'carousel')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (complex_id) REFERENCES complexes(id)
);

INSERT OR IGNORE INTO complex_settings (complex_id, graduates_count, huffadh_count)
VALUES (1, 0, 0);
