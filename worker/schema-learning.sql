-- Migration: learn weekly shopping habits
-- wrangler d1 execute family-shop --remote --file=schema-learning.sql

ALTER TABLE master_items ADD COLUMN week_add_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE master_items ADD COLUMN last_added_to_week_at INTEGER;
