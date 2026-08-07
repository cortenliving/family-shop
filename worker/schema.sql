-- Family Shop D1 schema
-- Apply: wrangler d1 execute family-shop --file=worker/schema.sql

CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_families_code ON families(code);

CREATE TABLE IF NOT EXISTS master_items (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  barcode TEXT,
  size_label TEXT,
  image_url TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  frequent INTEGER NOT NULL DEFAULT 0,
  default_notes TEXT,
  week_add_count INTEGER NOT NULL DEFAULT 0,
  last_added_to_week_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_master_family ON master_items(family_id);
CREATE INDEX IF NOT EXISTS idx_master_barcode ON master_items(family_id, barcode);

CREATE TABLE IF NOT EXISTS shopping_items (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  master_item_id TEXT NOT NULL,
  quantity TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  checked INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER,
  added_at INTEGER NOT NULL,
  added_by TEXT,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  FOREIGN KEY (master_item_id) REFERENCES master_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shopping_family ON shopping_items(family_id);

CREATE TABLE IF NOT EXISTS family_members (
  id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  last_seen_at INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (family_id, id),
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_members_family ON family_members(family_id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  member_id TEXT,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_family ON push_subscriptions(family_id);
